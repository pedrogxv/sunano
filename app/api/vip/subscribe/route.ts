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
  getLatestSubscriptionForUser,
} from "@/lib/server/repositories/vip-subscription-repository"
import { syncSubscriptionWithAsaas } from "@/lib/server/vip-subscription-sync"
import { isVipActive } from "@/lib/account-tier"
import { VIP_SUBSCRIPTION_PRICE_CENTS } from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { absoluteUrl } from "@/lib/site-url"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
  })
}

/**
 * POST /api/vip/subscribe — inicia uma assinatura recorrente de VIP
 * (R$8,90/mês, só cartão). Cria um Asaas Checkout hospedado vinculado a uma
 * assinatura (chargeTypes: RECURRENT) — o backend nunca recebe dado de
 * cartão, o cliente digita tudo na página hospedada da Asaas.
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
    //  • CARTÃO pendente (sem asaas_subscription_id): é só um checkout
    //    hospedado em aberto. Não há o que gerenciar — expira sozinho.
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
      error = "Você tem um checkout de assinatura em aberto. Conclua ou aguarde ele expirar."
      code = "subscription_already_pending"
    } else if (isPendingPix) {
      error = "Você já tem uma assinatura PIX aguardando o pagamento do primeiro mês."
      code = "subscription_pending_pix"
    } else {
      error = "Você já tem uma assinatura ativa. Gerencie-a nas configurações da conta."
      code = "subscription_already_active"
    }

    return NextResponse.json(
      { error, code, manageUrl: isPendingCheckout ? null : "/conta#assinatura" },
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
  // para poder reassinar — ou seja, a perder o acesso primeiro. A cobrança
  // não duplica porque a assinatura nova começa a cobrar só no fim do
  // período atual (`nextDueDate` abaixo parte de `vip_expires_at`).
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
  // diferentes (ver abaixo), mas a MESMA recorrência mensal.
  const paymentMethod: "credit_card" | "pix" =
    (rawBody as { paymentMethod?: unknown } | null)?.paymentMethod === "pix" ? "pix" : "credit_card"

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
  // `nextDueDate` da assinatura = daqui a 1 mês, NÃO hoje. O checkout
  // hospedado (chargeTypes: ["RECURRENT"]) já cobra o 1º mês na hora que o
  // cliente paga a página; a assinatura recorrente só assume a partir do
  // 2º ciclo. Se `nextDueDate` fosse hoje, a Asaas geraria uma 2ª cobrança
  // imediata para o mesmo dia (cobrança do checkout + 1º ciclo da
  // subscription) — cobrança dupla no mês 1.
  //
  // REASSINATURA DENTRO DO PERÍODO PAGO: o ciclo parte de `vip_expires_at`,
  // não de hoje. O checkout cobra 1 mês agora, e esse mês é ADICIONADO ao
  // saldo restante (`activate_vip_subscription` usa
  // `greatest(now(), vip_expires_at) + 1 month`), então nenhum dia pago se
  // perde. Se a recorrência partisse de hoje, a 2ª cobrança cairia ainda
  // dentro do período que o usuário já tinha.
  const firstRecurringDueDate =
    isResubscribeWithinPaidPeriod && profile?.vip_expires_at
      ? new Date(profile.vip_expires_at)
      : new Date()
  firstRecurringDueDate.setMonth(firstRecurringDueDate.getMonth() + 1)
  const nextDueDate = firstRecurringDueDate.toISOString().slice(0, 10)

  if (paymentMethod === "pix") {
    // ─── PIX ───────────────────────────────────────────────────────────
    // Sem checkout hospedado: `POST /v3/checkouts` com
    // `chargeTypes: ["RECURRENT"]` aceita SOMENTE cartão. A assinatura PIX é
    // criada direto em `POST /v3/subscriptions` (que aceita
    // `billingType: "PIX"`), e a partir daí a Asaas gera a cobrança de cada
    // ciclo sozinha — mesma recorrência mensal do cartão. A diferença é que
    // o usuário paga o QR de cada mês manualmente (não é Pix Automático).
    //
    // `nextDueDate` AQUI É DIFERENTE do cartão: como não existe uma cobrança
    // avulsa inicial (o checkout hospedado é quem cobrava o 1º mês), é a
    // própria assinatura que gera a 1ª cobrança — então ela vence HOJE. Usar
    // a data de daqui a 1 mês deixaria o usuário assinando sem nada para
    // pagar e sem VIP até lá.
    //
    // REASSINATURA DENTRO DO PERÍODO PAGO: o 1º vencimento continua hoje (é
    // o mês que ele está comprando agora, somado ao saldo restante pela
    // RPC), e os ciclos seguintes seguem a partir daí.
    const pixFirstDueDate = new Date().toISOString().slice(0, 10)

    let subscription
    try {
      subscription = await createPixSubscription({
        customerId: asaasCustomerId,
        amountCents: VIP_SUBSCRIPTION_PRICE_CENTS,
        description: "Assinatura VIP - Sunano",
        externalReference: subscriptionId,
        nextDueDate: pixFirstDueDate,
      })
    } catch (err) {
      console.error("[vip/subscribe] createPixSubscription:", err)
      return NextResponse.json({ error: "Não foi possível iniciar a assinatura." }, { status: 502 })
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
    })

    if (!firstPayment) {
      // Assinatura criada, cobrança ainda não visível na API (eventual
      // consistência). O webhook PAYMENT_CREATED grava o id quando chegar.
      return NextResponse.json({
        ok: true,
        paymentMethod: "pix",
        pending: true,
        message: "Assinatura criada. A cobrança do primeiro mês aparecerá em instantes.",
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
          amountCents: VIP_SUBSCRIPTION_PRICE_CENTS,
        },
      })
    } catch (err) {
      console.error("[vip/subscribe] getPixQrCode:", err)
      return NextResponse.json({
        ok: true,
        paymentMethod: "pix",
        pending: true,
        message: "Assinatura criada. Abra as configurações da conta para pagar a cobrança do mês.",
      })
    }
  }

  try {
    const checkout = await createSubscriptionCheckout({
      customerId: asaasCustomerId,
      amountCents: VIP_SUBSCRIPTION_PRICE_CENTS,
      description: "Assinatura VIP - Sunano",
      externalReference: subscriptionId,
      nextDueDate,
      successUrl: absoluteUrl("/conta?vip=success"),
      cancelUrl: absoluteUrl("/conta?vip=cancel"),
      expiredUrl: absoluteUrl("/conta?vip=expired"),
      minutesToExpire: 60,
    })

    await createSubscriptionRecord({
      id: subscriptionId,
      userId: user.id,
      asaasCheckoutId: checkout.id,
      asaasCustomerId,
      paymentMethod: "credit_card",
    })

    return NextResponse.json({ ok: true, paymentMethod: "credit_card", checkoutUrl: checkout.link })
  } catch (err) {
    console.error("[vip/subscribe] createSubscriptionCheckout:", err)
    return NextResponse.json({ error: "Não foi possível iniciar a assinatura." }, { status: 502 })
  }
}
