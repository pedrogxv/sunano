import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { findOrCreateCustomer, createSubscriptionCheckout } from "@/lib/server/integrations/asaas"
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
 * criar o checkout, se falta telefone/endereço no perfil (a Asaas Checkout
 * de cartão sempre exige) — pro modal mostrar os campos direto em vez de só
 * descobrir isso depois de um 400 do POST.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("phone, postal_code, street, number, neighborhood, city, state")
    .eq("id", user.id)
    .single()

  const hasCompleteAddressInfo = Boolean(
    profile?.phone &&
      profile?.postal_code &&
      profile?.street &&
      profile?.number &&
      profile?.neighborhood &&
      profile?.city &&
      profile?.state
  )

  return NextResponse.json({ hasCompleteAddressInfo })
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
    // Assinatura confirmada viva na Asaas. Se o checkout ainda está pendente
    // (sem asaas_subscription_id), não há o que gerenciar — só esperar.
    const isPendingCheckout = ongoing.asaasSubscriptionId == null
    return NextResponse.json(
      {
        error: isPendingCheckout
          ? "Você tem um checkout de assinatura em aberto. Conclua ou aguarde ele expirar."
          : "Você já tem uma assinatura ativa. Gerencie-a nas configurações da conta.",
        code: isPendingCheckout ? "subscription_already_pending" : "subscription_already_active",
        manageUrl: isPendingCheckout ? null : "/conta#assinatura",
      },
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

  // Assinatura só aceita cartão — Asaas Checkout de cartão sempre exige
  // telefone/endereço completos (mesma exigência do checkout de loja).
  // Usa o que já está salvo no perfil antes de exigir de novo no corpo.
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
  }

  if (hasCompleteAddress) {
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
      phone: address.guestPhone,
      postalCode: address.guestPostalCode,
      address: address.guestStreet,
      addressNumber: address.guestNumber,
      complement: address.guestComplement,
      province: address.guestNeighborhood,
      city: address.guestCity,
      state: address.guestState,
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
    })

    return NextResponse.json({ ok: true, checkoutUrl: checkout.link })
  } catch (err) {
    console.error("[vip/subscribe] createSubscriptionCheckout:", err)
    return NextResponse.json({ error: "Não foi possível iniciar a assinatura." }, { status: 502 })
  }
}
