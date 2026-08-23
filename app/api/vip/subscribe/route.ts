import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { findOrCreateCustomer, createSubscriptionCheckout } from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { payerInfoSchema, payerAddressSchema } from "@/lib/server/validation/guest-checkout"
import { getOngoingSubscriptionForUser, createSubscriptionRecord } from "@/lib/server/repositories/vip-subscription-repository"
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

  const { data: profile } = await db
    .from("user_profiles")
    .select(
      "account_tier, vip_expires_at, full_name, cpf, asaas_customer_id, phone, postal_code, street, number, complement, neighborhood, city, state"
    )
    .eq("id", user.id)
    .single()

  // Trava de dupla origem: já é VIP ativo por qualquer via (Aura, cargo ou
  // assinatura anterior) — nunca cria uma segunda cobrança na Asaas.
  if (isVipActive(profile?.account_tier, profile?.vip_expires_at)) {
    return NextResponse.json({ error: "Você já é VIP.", code: "vip_already_active" }, { status: 409 })
  }

  // Já existe uma assinatura em curso (pending/active/past_due) — não deixa
  // criar uma segunda em paralelo (evita cobrança duplicada por clique
  // duplo/retry antes do 1º pagamento confirmar).
  const ongoing = await getOngoingSubscriptionForUser(user.id)
  if (ongoing) {
    return NextResponse.json(
      { error: "Você já tem uma assinatura em andamento.", code: "subscription_already_pending" },
      { status: 409 }
    )
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

  const subscriptionId = randomUUID()
  const nextDueDate = new Date().toISOString().slice(0, 10)

  try {
    const checkout = await createSubscriptionCheckout({
      customerId: asaasCustomerId,
      amountCents: VIP_SUBSCRIPTION_PRICE_CENTS,
      description: "Assinatura VIP — Sunano",
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
