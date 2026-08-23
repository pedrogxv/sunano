import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/** Rebaixa em lote quem passou de `vip_expires_at` — chamada pelo cron diário (ver app/api/cron/vip-expiration). */
export async function expireVipAccounts(): Promise<number> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("expire_vip_accounts")
  if (error) throw error
  return (data as number) ?? 0
}

export type VipSubscriptionStatus = "pending" | "active" | "past_due" | "canceled" | "expired"

export type VipSubscription = {
  id: string
  userId: string
  asaasCheckoutId: string
  asaasSubscriptionId: string | null
  status: VipSubscriptionStatus
  currentPeriodEnd: string | null
  canceledAt: string | null
}

function mapSubscription(row: {
  id: string
  user_id: string
  asaas_checkout_id: string
  asaas_subscription_id: string | null
  status: VipSubscriptionStatus
  current_period_end: string | null
  canceled_at: string | null
}): VipSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    asaasCheckoutId: row.asaas_checkout_id,
    asaasSubscriptionId: row.asaas_subscription_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    canceledAt: row.canceled_at,
  }
}

/**
 * Assinatura "em curso" do usuário — qualquer status que ainda ocupa a
 * trava de dupla origem (pending/active/past_due). Usada por
 * `POST /api/vip/subscribe` para decidir se pode criar outra.
 */
export async function getOngoingSubscriptionForUser(userId: string): Promise<VipSubscription | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("vip_subscriptions")
    .select("id, user_id, asaas_checkout_id, asaas_subscription_id, status, current_period_end, canceled_at")
    .eq("user_id", userId)
    .in("status", ["pending", "active", "past_due"])
    .maybeSingle()
  if (error) throw error
  return data ? mapSubscription(data) : null
}

/** Grava a linha "pending" recém-criada no checkout de assinatura (ver POST /api/vip/subscribe). */
export async function createSubscriptionRecord(params: {
  id: string
  userId: string
  asaasCheckoutId: string
  asaasCustomerId: string
}): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("vip_subscriptions").insert({
    id: params.id,
    user_id: params.userId,
    asaas_checkout_id: params.asaasCheckoutId,
    asaas_customer_id: params.asaasCustomerId,
    status: "pending",
  })
  if (error) throw error
}

/** 1º pagamento de uma assinatura recém-criada (webhook CHECKOUT_PAID) — idempotente. */
export async function activateSubscriptionFromWebhook(params: {
  asaasCheckoutId: string
  asaasSubscriptionId: string
  asaasPaymentId: string
}): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("activate_vip_subscription", {
    p_asaas_checkout_id: params.asaasCheckoutId,
    p_asaas_subscription_id: params.asaasSubscriptionId,
    p_asaas_payment_id: params.asaasPaymentId,
  })
  if (error) throw error
  return Boolean(data)
}

/** Ciclos seguintes (webhook PAYMENT_CONFIRMED/PAYMENT_RECEIVED) — idempotente. */
export async function renewSubscriptionFromWebhook(params: {
  asaasSubscriptionId: string
  asaasPaymentId: string
}): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("renew_vip_subscription", {
    p_asaas_subscription_id: params.asaasSubscriptionId,
    p_asaas_payment_id: params.asaasPaymentId,
  })
  if (error) throw error
  return Boolean(data)
}

/** Cobrança do ciclo atrasada (webhook PAYMENT_OVERDUE) — não rebaixa na hora. */
export async function markSubscriptionPastDue(asaasSubscriptionId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("mark_vip_subscription_past_due", {
    p_asaas_subscription_id: asaasSubscriptionId,
  })
  if (error) throw error
  return Boolean(data)
}

/** Cancelamento pedido pelo usuário (POST /api/vip/cancel). */
export async function cancelSubscriptionForUser(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("cancel_vip_subscription", { p_user_id: userId })
  if (error) throw error
  return Boolean(data)
}

/** Cancelamento remoto, feito no painel Asaas (webhook SUBSCRIPTION_DELETED). */
export async function cancelSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("cancel_vip_subscription", {
    p_asaas_subscription_id: asaasSubscriptionId,
  })
  if (error) throw error
  return Boolean(data)
}

/**
 * Checkout abandonado/expirado antes de pagar (webhook CHECKOUT_EXPIRED /
 * CHECKOUT_CANCELED) — nesse ponto a linha ainda está 'pending' e nunca
 * teve asaas_subscription_id preenchido, então localiza por
 * asaas_checkout_id (o único identificador que já existe desde a criação
 * em POST /api/vip/subscribe). Sem isso a linha ficaria presa em 'pending'
 * para sempre, bloqueando novas tentativas de assinatura.
 */
export async function cancelSubscriptionByCheckoutId(asaasCheckoutId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("cancel_vip_subscription", {
    p_asaas_checkout_id: asaasCheckoutId,
  })
  if (error) throw error
  return Boolean(data)
}
