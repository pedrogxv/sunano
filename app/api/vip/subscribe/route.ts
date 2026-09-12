import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  findOrCreateCustomer,
  createSubscriptionCheckout,
  createPixSubscription,
  getSubscriptionPayments,
  getPixQrCode,
} from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { payerInfoSchema, payerAddressSchema } from "@/lib/server/validation/guest-checkout"
import {
  createSubscriptionRecord,
  reactivateSubscriptionRecord,
  getLatestSubscriptionForUser,
} from "@/lib/server/repositories/vip-subscription-repository"
import { syncSubscriptionWithAsaas } from "@/lib/server/vip-subscription-sync"
import { isVipActive } from "@/lib/account-tier"
import { getVipPlan, parseVipBillingPeriod, VIP_PLANS } from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { absoluteUrl } from "@/lib/site-url"
import { isoDateInTimeZone } from "@/lib/server/time"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Validade do checkout hospedado de cartão.
 *
 * Usado em DOIS lugares que precisam concordar: o `minutesToExpire` enviado à
 * Asaas e o `checkout_expires_at` gravado localmente. Separá-los em dois
 * literais faria a trava local soltar antes ou depois do checkout real
 * morrer — no primeiro caso permitindo um 2º checkout enquanto o 1º ainda
 * aceita pagamento, que é exatamente a cobrança duplicada que a trava existe
 * para impedir.
 */
const CHECKOUT_MINUTES_TO_EXPIRE = 60

/**
 * GET /api/vip/subscribe — diz ao modal de assinatura, ANTES de tentar
 * criar o checkout, quais dados de cobrança faltam no perfil (a Asaas
 * Checkout de cartão exige o pagador completo: nome/CPF para criar o
 * customer, telefone/endereço para tokenizar o cartão) — pro modal mostrar
 * exatamente esses campos em vez de só descobrir isso depois de um 400.
 *
 * `needsPayerInfo` e `needsAddressInfo` são separados de propósito: o POST
 * valida os dois blocos por schemas distintos (`payerInfoSchema` e
 * `payerAddressSchema`) e o modal precisa enviar exatamente o que falta.
 * Enquanto o GET só reportava endereço, quem tinha endereço salvo mas não
 * tinha nome/CPF recebia "Informe seu nome completo." num formulário que
 * sequer mostrava esse campo.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("full_name, cpf, phone, postal_code, street, number, neighborhood, city, state")
    .eq("id", user.id)
    .single()

  const hasPayerInfo = Boolean(profile?.full_name && profile?.cpf)

  const hasCompleteAddressInfo = Boolean(
    profile?.phone &&
      profile?.postal_code &&
      profile?.street &&
      profile?.number &&
      profile?.neighborhood &&
      profile?.city &&
      profile?.state
  )

  return NextResponse.json({
    hasPayerInfo,
    hasCompleteAddressInfo,
    // Pré-preenche o que já existe — o usuário confirma em vez de redigitar.
    payer: {
      fullName: profile?.full_name ?? null,
      cpf: profile?.cpf ?? null,
    },
    // O catálogo vem do servidor para a interface não repetir preço nem
    // periodicidade em lugar nenhum. O cliente escolhe a CHAVE do plano; o
    // POST reconfere essa chave no mesmo catálogo antes de cobrar qualquer
    // coisa, então um preço adulterado no devtools não tem efeito.
    plans: Object.values(VIP_PLANS).map((plan) => ({
      period: plan.period,
      priceCents: plan.priceCents,
      months: plan.months,
      label: plan.label,
      unitLabel: plan.unitLabel,
    })),
  })
}

/**
 * POST /api/vip/subscribe — inicia uma assinatura recorrente de VIP, no plano
 * MENSAL (R$ 8,90/mês) ou ANUAL (R$ 89,90/ano), pagando com cartão ou PIX.
 *
 * SEGURANÇA DO PLANO
 * ------------------
 * O corpo da requisição envia apenas uma CHAVE (`billingPeriod`), nunca preço
 * nem duração. `parseVipBillingPeriod` normaliza essa chave contra o catálogo
 * hardcoded de `lib/vip-plan.ts` (qualquer valor não reconhecido cai no
 * mensal, o plano mais curto), e é esse catálogo que define o que é enviado à
 * Asaas — valor e `cycle` — e o que é gravado em
 * `vip_subscriptions.billing_period`. As RPCs de pagamento leem o intervalo de
 * acesso DA LINHA, então nem o cliente nem o webhook conseguem comprar 12
 * meses pelo preço de 1.
 *
 * No cartão o caminho é o Asaas Checkout hospedado (chargeTypes: RECURRENT) —
 * o backend nunca recebe dado de cartão. No PIX a assinatura é criada direto
 * na API, que é o único jeito de combinar PIX com recorrência.
 */
export async function POST(request: NextRequest) {
  if (!isVipSubscriptionEnabled()) {
    return NextResponse.json(
      { error: "Assinatura VIP temporariamente indisponível.", code: "vip_subscription_disabled" },
      { status: 503 }
    )
  }

  const clientId = getClientIdentifier(request)
  const rateLimit = await checkRateLimit({
    action: "vip_subscribe_create",
    identifier: clientId,
    maxAttempts: 5,
    windowSeconds: 600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()

  // A reconciliação vem ANTES de qualquer leitura do perfil: ela pode
  // restaurar `account_tier`/`vip_expires_at` de quem estava pagando sem
  // acesso, e a trava de "já é VIP" logo abaixo precisa enxergar esse estado
  // já corrigido — senão criaria uma 2ª cobrança para quem já paga.
  //
  // Uma linha local `active` órfã (webhook perdido, cancelamento feito no
  // painel, cancel que não gravou local) deixava o usuário permanentemente
  // sem VIP e sem poder reassinar. A Asaas é quem cobra o cartão, então é
  // ela quem decide se ainda há assinatura de verdade.
  const { ongoing, unverified } = await syncSubscriptionWithAsaas(user.id)

  if (unverified) {
    // Asaas indisponível: não dá para confirmar nem descartar a assinatura.
    // Barrar é a única opção segura — liberar aqui poderia criar uma 2ª
    // cobrança em cima de uma assinatura viva.
    return NextResponse.json(
      {
        error: "Não foi possível confirmar sua assinatura agora. Tente novamente em alguns minutos.",
        code: "subscription_check_unavailable",
      },
      { status: 503 }
    )
  }

  if (ongoing) {
    // Assinatura confirmada viva na Asaas. Três situações distintas:
    //
    //  • CARTÃO pendente (sem asaas_subscription_id): é um checkout hospedado
    //    em aberto. A aba de assinatura agora mostra o prazo e oferece
    //    retomar o pagamento ou cancelar o checkout — por isso o manageUrl
    //    aponta para lá também neste caso. Antes dizia "aguarde expirar" e
    //    não havia realmente nada a fazer.
    //  • PIX pendente: a assinatura JÁ existe na Asaas e tem um QR esperando
    //    pagamento. Dizer "você já tem uma assinatura ativa" seria falso (ela
    //    não está ativa, está aguardando o 1º pagamento) e esconderia a única
    //    ação útil: ir pagar — ou cancelar, se desistiu.
    //  • Qualquer uma já ativa: gerenciar na conta.
    const isPendingCheckout = ongoing.asaasSubscriptionId == null
    const isPendingPix = ongoing.paymentMethod === "pix" && ongoing.status === "pending"

    let error: string
    let code: string
    if (isPendingCheckout) {
      error = "Você tem um checkout de assinatura em aberto. Conclua o pagamento ou cancele-o nas configurações da conta."
      code = "subscription_already_pending"
    } else if (isPendingPix) {
      error = "Você já tem uma assinatura PIX aguardando o pagamento da primeira cobrança."
      code = "subscription_pending_pix"
    } else {
      error = "Você já tem uma assinatura ativa. Gerencie-a nas configurações da conta."
      code = "subscription_already_active"
    }

    return NextResponse.json(
      { error, code, manageUrl: "/conta#assinatura" },
      { status: 409 }
    )
  }

  // Perfil lido DEPOIS da reconciliação — ver comentário acima.
  const { data: profile } = await db
    .from("user_profiles")
    .select(
      "account_tier, vip_expires_at, full_name, cpf, asaas_customer_id, phone, postal_code, street, number, complement, neighborhood, city, state"
    )
    .eq("id", user.id)
    .single()

  // Trava de dupla origem: já é VIP ativo por qualquer via (Aura, cargo ou
  // assinatura anterior) — nunca cria uma segunda cobrança na Asaas.
  //
  // EXCEÇÃO: quem cancelou a assinatura e ainda está usando o período já pago
  // pode voltar atrás. Barrar aqui obrigava a pessoa a esperar o VIP vencer
  // para poder reassinar — ou seja, a perder o acesso primeiro.
  //
  // Isso é uma REATIVAÇÃO, e ela não cobra nada: a 1ª cobrança da assinatura
  // é agendada para `vip_expires_at` (ver o cálculo de `nextDueDate` abaixo).
  //
  // O ciclo "cancelo e reativo todo dia para ser cobrado todo dia" não existe
  // por dois motivos independentes: (1) cada reativação apenas reagenda a
  // mesma cobrança para a mesma data, sem emitir nada no ato; e (2) a trava
  // `ongoing` logo acima — que consulta a Asaas — barra qualquer POST
  // enquanto houver assinatura viva, então para reativar de novo é preciso
  // cancelar de novo, e o resultado continua sendo uma única cobrança
  // agendada para o fim do período pago.
  const previous = await getLatestSubscriptionForUser(user.id)
  const wasCanceledSubscription =
    previous != null && (previous.status === "canceled" || previous.status === "expired")

  const vipActiveNow = isVipActive(profile?.account_tier, profile?.vip_expires_at)
  const isResubscribeWithinPaidPeriod = vipActiveNow && wasCanceledSubscription

  if (vipActiveNow && !isResubscribeWithinPaidPeriod) {
    return NextResponse.json({ error: "Você já é VIP.", code: "vip_already_active" }, { status: 409 })
  }

  const rawBody = await request.json().catch(() => null)

  // Método escolhido no modal. PIX e cartão têm exigências e fluxos
  // diferentes (ver abaixo), mas a mesma recorrência — mensal ou anual,
  // conforme o plano resolvido logo abaixo.
  const paymentMethod: "credit_card" | "pix" =
    (rawBody as { paymentMethod?: unknown } | null)?.paymentMethod === "pix" ? "pix" : "credit_card"

  // PLANO. O corpo manda só a chave; preço, ciclo da Asaas e duração do acesso
  // saem do catálogo do servidor. `parseVipBillingPeriod` é o único ponto onde
  // dado externo entra, e ele cai no mensal diante de qualquer valor estranho
  // — falhar para o plano mais curto e mais barato, nunca para o mais longo.
  const billingPeriod = parseVipBillingPeriod(
    (rawBody as { billingPeriod?: unknown } | null)?.billingPeriod
  )
  const plan = getVipPlan(billingPeriod)

  let payerName = profile?.full_name ?? null
  let payerDocument = profile?.cpf ?? null
  if (!payerName || !payerDocument) {
    const payer = payerInfoSchema.safeParse(rawBody)
    if (!payer.success) {
      return NextResponse.json(
        { error: payer.error.issues[0]?.message ?? "Informe seu nome e CPF para assinar." },
        { status: 400 }
      )
    }
    payerName = payer.data.guestName
    payerDocument = payer.data.guestDocument
    await db.from("user_profiles").update({ full_name: payerName, cpf: payerDocument }).eq("id", user.id)
  }

  // Telefone/endereço só são exigidos no CARTÃO: quem recusa o cadastro
  // incompleto é a tokenização do cartão (`creditCardHolderInfo`, montado
  // pela página hospedada a partir do customer). A cobrança PIX não tokeniza
  // nada e funciona só com nome + CPF — é o mesmo motivo pelo qual o
  // checkout PIX da loja nunca pediu endereço. Exigir aqui seria inventar
  // uma barreira que a Asaas não impõe.
  const hasCompleteAddress = Boolean(
    profile?.phone &&
      profile?.postal_code &&
      profile?.street &&
      profile?.number &&
      profile?.neighborhood &&
      profile?.city &&
      profile?.state
  )

  let address: {
    guestPhone: string
    guestPostalCode: string
    guestStreet: string
    guestNumber: string
    guestComplement?: string
    guestNeighborhood: string
    guestCity: string
    guestState: string
  } | null = null

  if (paymentMethod === "pix") {
    // PIX dispensa endereço, mas se o perfil já tiver os dados aproveitamos
    // para manter o cadastro na Asaas completo (o mesmo customer é usado
    // depois num eventual checkout de cartão, que exigiria tudo isso).
    address = hasCompleteAddress
      ? {
          guestPhone: profile!.phone!,
          guestPostalCode: profile!.postal_code!,
          guestStreet: profile!.street!,
          guestNumber: profile!.number!,
          guestComplement: profile!.complement ?? undefined,
          guestNeighborhood: profile!.neighborhood!,
          guestCity: profile!.city!,
          guestState: profile!.state!,
        }
      : null
  } else if (hasCompleteAddress) {
    address = {
      guestPhone: profile!.phone!,
      guestPostalCode: profile!.postal_code!,
      guestStreet: profile!.street!,
      guestNumber: profile!.number!,
      guestComplement: profile!.complement ?? undefined,
      guestNeighborhood: profile!.neighborhood!,
      guestCity: profile!.city!,
      guestState: profile!.state!,
    }
  } else {
    const parsedAddress = payerAddressSchema.safeParse(rawBody)
    if (!parsedAddress.success) {
      return NextResponse.json(
        { error: parsedAddress.error.issues[0]?.message ?? "Informe telefone e endereço para assinar." },
        { status: 400 }
      )
    }
    address = parsedAddress.data

    await db
      .from("user_profiles")
      .update({
        phone: address.guestPhone,
        postal_code: address.guestPostalCode,
        street: address.guestStreet,
        number: address.guestNumber,
        complement: address.guestComplement ?? null,
        neighborhood: address.guestNeighborhood,
        city: address.guestCity,
        state: address.guestState,
      })
      .eq("id", user.id)
  }

  let asaasCustomerId = profile?.asaas_customer_id ?? null
  try {
    const customer = await findOrCreateCustomer({
      name: payerName,
      cpfCnpj: payerDocument,
      email: user.email,
      // `address` é null só no PIX sem endereço no perfil — os campos são
      // opcionais em `findOrCreateCustomer` justamente para esse caso.
      phone: address?.guestPhone,
      postalCode: address?.guestPostalCode,
      address: address?.guestStreet,
      addressNumber: address?.guestNumber,
      complement: address?.guestComplement,
      province: address?.guestNeighborhood,
      city: address?.guestCity,
      state: address?.guestState,
    })
    asaasCustomerId = customer.id
    if (asaasCustomerId !== profile?.asaas_customer_id) {
      await db.from("user_profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", user.id)
    }
  } catch (err) {
    console.error("[vip/subscribe] findOrCreateCustomer:", err)
    return NextResponse.json({ error: "Não foi possível iniciar a assinatura." }, { status: 502 })
  }

  // Reassinatura recicla a MESMA linha de `vip_subscriptions` (user_id é
  // UNIQUE) preservando sua PK — ver `createSubscriptionRecord`. O
  // `externalReference` precisa refletir o id que de fato será gravado, e
  // não um uuid novo que a linha nunca vai receber.
  const subscriptionId = previous?.id ?? randomUUID()

  // ── QUANDO A PRIMEIRA COBRANÇA VENCE ──────────────────────────────────
  //
  // Regra única, para PIX e cartão: `nextDueDate` é o vencimento da 1ª
  // cobrança da assinatura (documentação da Asaas), e ele NUNCA cai dentro
  // de um período de VIP que o usuário já pagou.
  //
  //  • REATIVAÇÃO (cancelou e ainda tem VIP correndo): vence em
  //    `vip_expires_at` — exatamente o dia em que o acesso atual acabaria.
  //    Nenhuma cobrança hoje. Reativar é DESFAZER O CANCELAMENTO, não
  //    comprar outro mês: o usuário já pagou o mês em que está.
  //
  //    Era aqui que estava o bug: o PIX ignorava esse cálculo e vencia
  //    sempre HOJE, então cancelar e reativar no mesmo dia gerava um QR
  //    imediato de mais um mês. Repetindo o ciclo todo dia, o usuário
  //    pagava N meses adiantado num dia só — sempre pelo mesmo mês corrente
  //    que já estava pago. O cartão tinha o mesmo defeito por outra via: o
  //    checkout hospedado cobrava o 1º mês no ato, independentemente do
  //    `nextDueDate`.
  //
  //  • ASSINATURA NOVA (sem VIP ativo): vence HOJE. É a compra do 1º ciclo, e
  //    o acesso só é liberado quando ela for confirmada.
  //
  // TROCA DE PLANO NA REATIVAÇÃO: quem cancelou o mensal pode reativar no
  // anual (e vice-versa). Isso não muda nada aqui, e é justamente o que torna
  // a regra segura — a 1ª cobrança do plano novo vence no fim do período que
  // o plano antigo pagou, seja ela de R$ 8,90 ou de R$ 89,90. Nenhum dia pago
  // se perde e nada é cobrado adiantado. O `billing_period` gravado passa a
  // ser o novo (ver `reactivate_vip_subscription`), então quando aquela
  // cobrança for confirmada o acesso concedido é o do plano que a emitiu.
  //
  // Em ambos os casos a assinatura é a ÚNICA origem de cobrança — não
  // existe mais cobrança avulsa inicial somada ao 1º ciclo.
  // A data é formatada no fuso de Brasília, não em UTC: a Asaas cobra pelo
  // calendário brasileiro, e `vip_expires_at` é timestamptz. Um VIP que vence
  // 12/10 às 02:00 UTC ainda é dia 11 às 23:00 aqui — `toISOString()` diria
  // 12/10 e a cobrança cairia quase um dia depois do acesso ter acabado.
  const firstDueDate =
    isResubscribeWithinPaidPeriod && profile?.vip_expires_at
      ? new Date(profile.vip_expires_at)
      : new Date()
  const nextDueDate = isoDateInTimeZone(firstDueDate)

  if (paymentMethod === "pix") {
    // ─── PIX ───────────────────────────────────────────────────────────
    // Sem checkout hospedado: `POST /v3/checkouts` com
    // `chargeTypes: ["RECURRENT"]` aceita SOMENTE cartão. A assinatura PIX é
    // criada direto em `POST /v3/subscriptions` (que aceita
    // `billingType: "PIX"`), e a partir daí a Asaas gera a cobrança de cada
    // ciclo sozinha — mesma recorrência mensal do cartão. A diferença é que
    // o usuário paga o QR de cada mês manualmente (não é Pix Automático).
    //
    // `nextDueDate` vem do cálculo único acima. Na assinatura NOVA ele é
    // hoje (a 1ª cobrança é a compra do 1º mês). Na REATIVAÇÃO ele é
    // `vip_expires_at`: a Asaas agenda a cobrança para lá e NÃO emite nada
    // hoje — o usuário segue usando o mês que já pagou, sem QR nenhum para
    // pagar agora.
    let subscription
    try {
      subscription = await createPixSubscription({
        customerId: asaasCustomerId,
        amountCents: plan.priceCents,
        description: `Assinatura VIP ${plan.label} - Sunano`,
        externalReference: subscriptionId,
        nextDueDate,
        cycle: plan.asaasCycle,
      })
    } catch (err) {
      console.error("[vip/subscribe] createPixSubscription:", err)
      return NextResponse.json({ error: "Não foi possível iniciar a assinatura." }, { status: 502 })
    }

    // REATIVAÇÃO: a 1ª cobrança está agendada para o futuro, então não há QR
    // a exibir e nada a pagar agora. A linha nasce `active` (não `pending`):
    // o acesso VIP já existe e já foi pago, o que a reativação faz é só
    // garantir que a cobrança volte a acontecer no fim do período. Deixá-la
    // `pending` diria "aguardando o 1º pagamento" para quem é VIP neste
    // exato momento — e a aba de assinatura cobraria um QR inexistente.
    if (isResubscribeWithinPaidPeriod) {
      await reactivateSubscriptionRecord({
        id: subscriptionId,
        userId: user.id,
        asaasCustomerId,
        paymentMethod: "pix",
        asaasSubscriptionId: subscription.id,
        currentPeriodEnd: profile!.vip_expires_at!,
        billingPeriod,
      })

      return NextResponse.json({
        ok: true,
        paymentMethod: "pix",
        reactivated: true,
        chargedNow: false,
        nextChargeAt: nextDueDate,
        billingPeriod,
        priceCents: plan.priceCents,
      })
    }

    // A resposta de POST /v3/subscriptions traz a assinatura, não a cobrança
    // que ela agendou — o QR só existe no `payment`. Buscamos a 1ª cobrança
    // para já entregar o QR ao usuário nesta mesma resposta.
    let firstPayment
    try {
      const payments = await getSubscriptionPayments(subscription.id)
      firstPayment = payments[0] ?? null
    } catch (err) {
      console.error("[vip/subscribe] getSubscriptionPayments:", err)
      firstPayment = null
    }

    // A linha é gravada MESMO se o QR falhar: a assinatura já existe na
    // Asaas e cobrará de qualquer forma. Perder o registro aqui deixaria uma
    // assinatura órfã cobrando sem nenhum vínculo local — o oposto do que a
    // reconciliação consegue consertar. A aba "Assinatura" busca o QR de
    // novo sob demanda.
    await createSubscriptionRecord({
      id: subscriptionId,
      userId: user.id,
      asaasCheckoutId: null,
      asaasCustomerId,
      paymentMethod: "pix",
      asaasSubscriptionId: subscription.id,
      pendingPaymentId: firstPayment?.id ?? null,
      billingPeriod,
    })

    if (!firstPayment) {
      // Assinatura criada, cobrança ainda não visível na API (eventual
      // consistência). O webhook PAYMENT_CREATED grava o id quando chegar.
      return NextResponse.json({
        ok: true,
        paymentMethod: "pix",
        pending: true,
        billingPeriod,
        message: `Assinatura criada. A cobrança do primeiro ${
          plan.period === "yearly" ? "ano" : "mês"
        } aparecerá em instantes.`,
      })
    }

    try {
      const qr = await getPixQrCode(firstPayment.id, { clampToOrderWindow: false })
      return NextResponse.json({
        ok: true,
        paymentMethod: "pix",
        payment: {
          id: firstPayment.id,
          qrCodeBase64: qr.encodedImage,
          copyPaste: qr.payload,
          expiresAt: qr.expirationDate,
          amountCents: plan.priceCents,
        },
      })
    } catch (err) {
      console.error("[vip/subscribe] getPixQrCode:", err)
      return NextResponse.json({
        ok: true,
        paymentMethod: "pix",
        pending: true,
        billingPeriod,
        message: "Assinatura criada. Abra as configurações da conta para pagar a cobrança em aberto.",
      })
    }
  }

  // ─── CARTÃO ────────────────────────────────────────────────────────────
  // O checkout hospedado (chargeTypes: ["RECURRENT"]) é o único caminho: não
  // guardamos token de cartão em lugar nenhum — quem tokeniza é a página da
  // Asaas —, então mesmo a reativação precisa passar por lá para o cartão
  // ser cadastrado de novo.
  //
  // O que muda na REATIVAÇÃO é o `nextDueDate` (calculado acima como
  // `vip_expires_at`): a documentação da Asaas define esse campo como o
  // vencimento da PRIMEIRA cobrança da assinatura, e com ele no futuro o
  // cartão é apenas validado/salvo no momento do checkout — a cobrança só
  // acontece na data informada. Ou seja: o usuário confirma o cartão hoje e
  // paga só quando o período que ele já pagou terminar.
  //
  // Antes o `nextDueDate` da reativação era `vip_expires_at + 1 mês`, o que
  // assumia uma cobrança avulsa inicial no ato do checkout — justamente a
  // cobrança que não deveria existir para quem ainda está dentro do período
  // pago.
  try {
    const checkout = await createSubscriptionCheckout({
      customerId: asaasCustomerId,
      amountCents: plan.priceCents,
      description: `Assinatura VIP ${plan.label} - Sunano`,
      externalReference: subscriptionId,
      nextDueDate,
      cycle: plan.asaasCycle,
      successUrl: absoluteUrl("/conta?vip=success"),
      cancelUrl: absoluteUrl("/conta?vip=cancel"),
      expiredUrl: absoluteUrl("/conta?vip=expired"),
      minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
    })

    // O link e o prazo são GRAVADOS, não descartados como antes. São eles que
    // dão saída a quem fecha a aba no meio do pagamento: o link deixa retomar
    // de onde parou, e o prazo deixa a trava de "assinatura em andamento" se
    // soltar sozinha caso o webhook CHECKOUT_EXPIRED não chegue. Sem os dois,
    // a aba de assinatura só conseguia dizer "espere expirar" — por até uma
    // hora, e para sempre se o webhook se perdesse.
    await createSubscriptionRecord({
      id: subscriptionId,
      userId: user.id,
      asaasCheckoutId: checkout.id,
      asaasCustomerId,
      paymentMethod: "credit_card",
      checkoutLink: checkout.link,
      checkoutExpiresAt: new Date(
        Date.now() + CHECKOUT_MINUTES_TO_EXPIRE * 60_000
      ).toISOString(),
      // REATIVAÇÃO: preserva o período já pago. Zerá-lo aqui rebaixava a
      // assinatura de um VIP ativo para "aguardando pagamento" no instante em
      // que ele clicava em reativar — a aba passava a mostrar "Pagamento em
      // andamento" a quem tinha acesso corrente e nada devia. O acesso em si
      // (`user_profiles.vip_expires_at`) nunca foi tocado; o que quebrava era
      // o estado exibido da assinatura.
      keepCurrentPeriodEnd: isResubscribeWithinPaidPeriod
        ? (profile?.vip_expires_at ?? null)
        : null,
      billingPeriod,
    })

    return NextResponse.json({
      ok: true,
      paymentMethod: "credit_card",
      checkoutUrl: checkout.link,
      // A UI usa isto para não prometer "pagamento agora" numa reativação:
      // o checkout só cadastra o cartão, a cobrança fica para `nextDueDate`.
      reactivated: isResubscribeWithinPaidPeriod,
      chargedNow: !isResubscribeWithinPaidPeriod,
      nextChargeAt: nextDueDate,
      billingPeriod,
      priceCents: plan.priceCents,
    })
  } catch (err) {
    console.error("[vip/subscribe] createSubscriptionCheckout:", err)
    return NextResponse.json({ error: "Não foi possível iniciar a assinatura." }, { status: 502 })
  }
}
