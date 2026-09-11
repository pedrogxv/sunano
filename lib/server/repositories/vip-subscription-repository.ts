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

export type VipPaymentMethod = "credit_card" | "pix"

export type VipSubscription = {
  id: string
  userId: string
  /** NULL nas assinaturas PIX — elas não passam pelo checkout hospedado. */
  asaasCheckoutId: string | null
  asaasSubscriptionId: string | null
  status: VipSubscriptionStatus
  paymentMethod: VipPaymentMethod
  /** Cobrança PIX do ciclo em aberto, para montar o QR. NULL = nada a pagar agora. */
  pendingPaymentId: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
}

/** Colunas lidas em toda consulta de assinatura — uma fonte só, para não divergirem. */
const SUBSCRIPTION_COLUMNS =
  "id, user_id, asaas_checkout_id, asaas_subscription_id, status, payment_method, pending_payment_id, current_period_end, canceled_at"

function mapSubscription(row: {
  id: string
  user_id: string
  asaas_checkout_id: string | null
  asaas_subscription_id: string | null
  status: VipSubscriptionStatus
  payment_method: VipPaymentMethod | null
  pending_payment_id: string | null
  current_period_end: string | null
  canceled_at: string | null
}): VipSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    asaasCheckoutId: row.asaas_checkout_id,
    asaasSubscriptionId: row.asaas_subscription_id,
    status: row.status,
    // Linhas criadas antes da migration do PIX não têm a coluna preenchida
    // em memória se a consulta vier de um cache antigo — o default do banco
    // já é 'credit_card', isto só protege o caminho de leitura.
    paymentMethod: row.payment_method ?? "credit_card",
    pendingPaymentId: row.pending_payment_id,
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
  // `user_id` é UNIQUE, então isto sempre retorna 0 ou 1 linha. Mesmo assim
  // não uso `.maybeSingle()` (que ESTOURA se algum dia vierem 2, travando
  // tanto /subscribe quanto /cancel): ordeno por recência e pego a primeira.
  const { data, error } = await db
    .from("vip_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("user_id", userId)
    .in("status", ["pending", "active", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? mapSubscription(data[0]) : null
}

/**
 * Assinatura mais recente do usuário, em QUALQUER estado (inclusive
 * `canceled`/`expired`) — usada pela aba "Assinatura" das configurações da
 * conta (`GET /api/vip/subscription`) para mostrar o estado atual e decidir
 * se ainda dá para cancelar. `user_id` é UNIQUE, então há no máximo uma.
 */
export async function getLatestSubscriptionForUser(userId: string): Promise<VipSubscription | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("vip_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? mapSubscription(data[0]) : null
}

/**
 * Grava (ou recicla) a linha "pending" do checkout de assinatura recém-criado
 * (ver POST /api/vip/subscribe).
 *
 * `vip_subscriptions.user_id` é UNIQUE — há no máximo uma linha por usuário,
 * para sempre. Um `insert` puro quebraria toda RE-assinatura: quem já
 * cancelou (linha `canceled`), expirou (`expired`) ou abandonou um checkout
 * antigo (`pending` órfão que nenhum webhook limpou) carregaria um 23505 e
 * um 500 na cara. Reaproveitar a linha, resetando-a para o novo checkout, é
 * o caminho certo. Só chega aqui quem passou pela trava
 * `getOngoingSubscriptionForUser` em POST /api/vip/subscribe, que já barra
 * `pending`/`active`/`past_due` — então a linha existente, se houver, está
 * num estado terminal e pode ser sobrescrita com segurança.
 *
 * A PK É PRESERVADA, NUNCA REESCRITA. Um upsert com `onConflict: "user_id"`
 * mandando um `id` novo vira `UPDATE ... SET id = <novo uuid>` na linha
 * existente — e `vip_subscription_payments.subscription_id` referencia essa
 * PK (`on delete cascade`, mas SEM `on update cascade`). Quem já pagou pelo
 * menos um ciclo tem linha lá, então a troca da PK era barrada por violação
 * de FK: o insert estourava, o route devolvia 502 "Não foi possível iniciar
 * a assinatura" — DEPOIS do checkout já ter sido criado na Asaas — e a
 * reassinatura ficava impossível justamente para quem já tinha sido
 * assinante. Quem nunca pagou não tinha a linha da FK e reassinava normal,
 * o que fazia o bug parecer intermitente.
 *
 * Devolve o id EFETIVO da linha (o preservado, quando havia uma) para quem
 * chama poder alinhar o `externalReference` enviado à Asaas.
 */
export async function createSubscriptionRecord(params: {
  id: string
  userId: string
  /** Cartão: id do checkout hospedado. PIX: null (não existe checkout). */
  asaasCheckoutId: string | null
  asaasCustomerId: string
  /** Ausente = cartão, preservando o comportamento anterior deste método. */
  paymentMethod?: VipPaymentMethod
  /**
   * PIX: a assinatura já existe na Asaas no momento da criação da linha, ao
   * contrário do cartão (onde o id só nasce no CHECKOUT_PAID).
   */
  asaasSubscriptionId?: string | null
  /** PIX: cobrança do 1º ciclo, já gerada pela assinatura. */
  pendingPaymentId?: string | null
}): Promise<string> {
  const db = createSupabaseAdminClient()

  // Defesa em profundidade: quem chama já passa o id da linha existente
  // (ver POST /api/vip/subscribe), mas reconferir aqui garante que nenhum
  // outro caminho reintroduza a troca de PK que quebrava a reassinatura.
  const existing = await getLatestSubscriptionForUser(params.userId)
  const effectiveId = existing?.id ?? params.id

  const { error } = await db
    .from("vip_subscriptions")
    .upsert(
      {
        id: effectiveId,
        user_id: params.userId,
        asaas_checkout_id: params.asaasCheckoutId,
        asaas_subscription_id: params.asaasSubscriptionId ?? null,
        asaas_customer_id: params.asaasCustomerId,
        status: "pending",
        payment_method: params.paymentMethod ?? "credit_card",
        pending_payment_id: params.pendingPaymentId ?? null,
        current_period_end: null,
        canceled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
  if (error) throw error

  return effectiveId
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

/**
 * Assinatura pelo id da Asaas — usada pelo webhook para saber COMO tratar um
 * evento antes de agir: uma cobrança confirmada de assinatura PIX ainda
 * `pending` é o 1º pagamento (ativa), a mesma cobrança numa assinatura já
 * `active` é renovação. No cartão essa distinção não existe (o 1º pagamento
 * chega como CHECKOUT_PAID), por isso a consulta nasceu aqui.
 */
export async function getLatestSubscriptionByAsaasId(
  asaasSubscriptionId: string
): Promise<VipSubscription | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("vip_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("asaas_subscription_id", asaasSubscriptionId)
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? mapSubscription(data[0]) : null
}

/**
 * 1º pagamento de uma assinatura PIX (webhook PAYMENT_RECEIVED/CONFIRMED de
 * uma cobrança cuja assinatura ainda está `pending`). Diferente do cartão,
 * localiza pela assinatura — no PIX não há checkout hospedado, então
 * `asaas_checkout_id` é NULL e `activate_vip_subscription` não serviria.
 * Idempotente.
 */
export async function activatePixSubscriptionFromWebhook(params: {
  asaasSubscriptionId: string
  asaasPaymentId: string
}): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("activate_vip_subscription_pix", {
    p_asaas_subscription_id: params.asaasSubscriptionId,
    p_asaas_payment_id: params.asaasPaymentId,
  })
  if (error) throw error
  return Boolean(data)
}

/**
 * Nova cobrança PIX gerada pela Asaas para o ciclo seguinte (webhook
 * PAYMENT_CREATED). Guarda o payment id para a UI conseguir mostrar o QR do
 * mês — sem isso o usuário não teria como pagar a renovação.
 */
export async function setPendingPixPayment(params: {
  asaasSubscriptionId: string
  asaasPaymentId: string
}): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("set_vip_subscription_pending_payment", {
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

/**
 * Alinha a linha local ao que a Asaas diz sobre a assinatura — a Asaas é a
 * fonte de verdade de "isso ainda cobra?", o banco local é espelho.
 *
 * Existe porque as duas bases divergem na prática: webhook perdido (URL de
 * ngrok trocada, deploy no meio da entrega), cancelamento feito direto no
 * painel da Asaas, ou um cancel nosso que foi até a Asaas mas não gravou
 * local. Sem reconciliar, uma linha `active` órfã trava a reassinatura para
 * sempre — o usuário fica sem VIP e sem poder assinar de novo (era
 * exatamente o bug relatado), ou pior, pagando sem acesso.
 *
 * `asaasActive` vem de `getSubscription`: `false` quando a assinatura
 * sumiu (404) ou voltou `deleted: true`/status inativo.
 */
export async function reconcileSubscriptionWithAsaas(params: {
  userId: string
  asaasActive: boolean
}): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("reconcile_vip_subscription", {
    p_user_id: params.userId,
    p_asaas_active: params.asaasActive,
  })
  if (error) throw error
  return Boolean(data)
}

/**
 * Assinatura encerrada na Asaas (webhook SUBSCRIPTION_DELETED). Diferente do
 * cancelamento voluntário (`cancelSubscriptionForUser`): se a linha estava
 * `past_due` quando a Asaas excluiu a assinatura, o último ciclo não foi
 * pago e não haverá renovação — a RPC corta `vip_expires_at` para agora
 * (o cron de expiração rebaixa na próxima passada; `isVipActive` já reflete
 * na hora). Se estava `active`, mantém o período pago. Idempotente.
 */
export async function endSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("end_vip_subscription", {
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
