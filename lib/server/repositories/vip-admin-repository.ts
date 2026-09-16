import "server-only"

import { isVipActive } from "@/lib/account-tier"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getProfileFramesByUser } from "@/lib/server/repositories/vip-founder-repository"
import type {
  VipPaymentMethod,
  VipSubscriptionStatus,
} from "@/lib/server/repositories/vip-subscription-repository"
import { getVipPlan, parseVipBillingPeriod, type VipBillingPeriod } from "@/lib/vip-plan"

/**
 * Repositório do painel /admin/vips — ÚNICA porta de acesso do admin às
 * assinaturas VIP (ver ARQUITETURA.md: nenhuma página consulta o banco direto).
 *
 * O recorte aqui é diferente do de `vip-subscription-repository.ts`, que
 * atende o PRÓPRIO usuário (uma linha por vez, sempre a dele). Este lista e
 * agrega sobre todos, e precisa responder uma pergunta que aquele não faz:
 * "quem é VIP agora?" — que não é a mesma coisa que "quem tem assinatura".
 *
 * VIP VEM DE TRÊS ORIGENS, e o admin precisa enxergar as três:
 *   • `subscription` — assinatura recorrente na Asaas (cartão ou PIX);
 *   • `aura`         — mês avulso comprado com Aura (`purchase_vip_with_aura`);
 *   • `manual`       — concedido pelo admin aqui (ou VIP vitalício de cargo).
 *
 * Só a primeira tem linha em `vip_subscriptions`. As outras duas existem
 * apenas como `account_tier='vip'` em `user_profiles`, então uma listagem
 * feita só sobre `vip_subscriptions` esconderia justamente os VIPs que o
 * admin concedeu — por isso a origem é DERIVADA do par (perfil, assinatura),
 * nunca de uma coluna só.
 */

/** Quem é VIP e não tem assinatura viva: foi concedido/comprado avulso. */
export type VipOrigin = "subscription" | "aura_or_manual"

export type VipAdminRow = {
  userId: string
  displayName: string
  displaySlug: string | null
  avatarUrl: string | null
  /**
   * Moldura do membro — a MESMA do perfil e do fórum. O admin precisa
   * reconhecer quem é Fundador sem abrir o perfil.
   */
  frame: ProfileFrameIdentity
  email: string | null
  /** VIP valendo AGORA (`isVipActive`), não "já foi VIP algum dia". */
  vipActive: boolean
  /** NULL = VIP sem expiração (concessão manual/vitalícia). */
  vipExpiresAt: string | null
  origin: VipOrigin
  /** Null quando o VIP não veio de assinatura (Aura/manual). */
  subscription: {
    id: string
    status: VipSubscriptionStatus
    paymentMethod: VipPaymentMethod
    /** Plano contratado — o admin precisa saber se a cobrança é mensal ou anual. */
    billingPeriod: VipBillingPeriod
    /** Valor da cobrança do plano, em centavos. */
    priceCents: number
    asaasSubscriptionId: string | null
    asaasCustomerId: string | null
    currentPeriodEnd: string | null
    canceledAt: string | null
    createdAt: string
    updatedAt: string
  } | null
}

export type VipAdminTotals = {
  /** VIPs valendo agora, de qualquer origem. */
  activeVips: number
  /** Assinaturas que ainda cobram (active + past_due). */
  payingSubscribers: number
  /** Assinaturas `past_due` — cobrança atrasada, acesso ainda de pé. */
  pastDue: number
  /** Assinaturas `pending` — checkout/1º PIX em aberto, ninguém pagou ainda. */
  pending: number
  /** VIPs sem assinatura (Aura ou concessão manual). */
  auraOrManual: number
  /** Quantas das assinaturas vivas são do plano anual. */
  yearlySubscribers: number
  /**
   * Receita recorrente MENSALIZADA em centavos, das assinaturas que ainda
   * cobram. O plano anual entra rateado (preço ÷ 12), não pelo valor cheio —
   * senão um assinante anual apareceria como 10 mensais.
   */
  mrrCents: number
}

/** Recortes da listagem. `all` inclui histórico (canceladas/expiradas). */
export type VipAdminFilter =
  | "active_vips"
  | "subscribers"
  | "past_due"
  | "pending"
  | "aura_or_manual"
  | "canceled"
  | "all"

const SUBSCRIPTION_COLUMNS =
  "id, user_id, status, payment_method, billing_period, asaas_subscription_id, asaas_customer_id, current_period_end, canceled_at, created_at, updated_at"

const PROFILE_COLUMNS = "id, display_name, display_slug, avatar_url, account_tier, vip_expires_at"

type SubscriptionRow = {
  id: string
  user_id: string
  status: VipSubscriptionStatus
  payment_method: VipPaymentMethod | null
  billing_period: string | null
  asaas_subscription_id: string | null
  asaas_customer_id: string | null
  current_period_end: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  display_name: string | null
  display_slug: string | null
  avatar_url: string | null
  account_tier: "common" | "vip"
  vip_expires_at: string | null
}

/** Assinatura que ainda gera cobrança — a definição usada em toda esta tela. */
function isLiveSubscription(status: VipSubscriptionStatus): boolean {
  return status === "active" || status === "past_due"
}

function displayNameOf(profile: ProfileRow | undefined, userId: string): string {
  return profile?.display_name?.trim() || `Membro ${userId.slice(0, 6)}`
}

/**
 * `frame` é parâmetro OBRIGATÓRIO de propósito: como campo opcional, toda
 * listagem nova esquecia de passá-lo e o VIP Fundador saía com a coroa comum
 * (ver `AGENTS.md`). Obrigatório, o compilador cobra a busca em LOTE
 * (`getProfileFramesByUser`) de quem monta a linha.
 */
function buildRow(
  userId: string,
  profile: ProfileRow | undefined,
  subscription: SubscriptionRow | undefined,
  email: string | null,
  frame: ProfileFrameIdentity
): VipAdminRow {
  const vipActive = isVipActive(profile?.account_tier, profile?.vip_expires_at)
  // Origem é o que EXPLICA o VIP atual, não o que existe no histórico: uma
  // linha `canceled` não torna o VIP de hoje "de assinatura" — se ele ainda
  // vale, veio do período pago restante ou de outra via. Por isso só uma
  // assinatura viva marca `subscription`.
  const live = subscription != null && isLiveSubscription(subscription.status)

  return {
    userId,
    displayName: displayNameOf(profile, userId),
    displaySlug: profile?.display_slug ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    frame,
    email,
    vipActive,
    vipExpiresAt: profile?.vip_expires_at ?? null,
    origin: live ? "subscription" : "aura_or_manual",
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          paymentMethod: subscription.payment_method ?? "credit_card",
          billingPeriod: parseVipBillingPeriod(subscription.billing_period),
          priceCents: getVipPlan(subscription.billing_period).priceCents,
          asaasSubscriptionId: subscription.asaas_subscription_id,
          asaasCustomerId: subscription.asaas_customer_id,
          currentPeriodEnd: subscription.current_period_end,
          canceledAt: subscription.canceled_at,
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at,
        }
      : null,
  }
}

/**
 * E-mails dos usuários listados. Vive em `auth.users`, fora do alcance de um
 * join do PostgREST, então é uma segunda consulta — e uma que só o
 * service_role pode fazer.
 *
 * Falha aqui NÃO derruba a listagem: e-mail é um confortável a mais para o
 * admin identificar a pessoa, não o dado principal da tela.
 */
async function fetchEmails(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>()
  if (userIds.length === 0) return emails

  const db = createSupabaseAdminClient()
  const results = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await db.auth.admin.getUserById(id)
        return [id, data?.user?.email ?? null] as const
      } catch {
        return [id, null] as const
      }
    })
  )
  for (const [id, email] of results) {
    if (email) emails.set(id, email)
  }
  return emails
}

/**
 * Listagem da tela. Junta as duas fontes (assinaturas e perfis VIP) em uma
 * linha por USUÁRIO — nunca duas para a mesma pessoa, mesmo quando ela tem
 * assinatura e VIP ativo ao mesmo tempo (o caso normal de um assinante).
 *
 * Pagina por OFFSET, não por keyset: o conjunto é pequeno por natureza
 * (assinantes de um site, não eventos), e a ordenação precisa misturar duas
 * consultas — um cursor sobre chaves de tabelas diferentes não seria estável.
 */
export async function listVipsForAdmin(params: {
  filter: VipAdminFilter
  search?: string | null
  page?: number
  pageSize?: number
}): Promise<{ rows: VipAdminRow[]; total: number; hasMore: boolean }> {
  const db = createSupabaseAdminClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25))
  const search = params.search?.trim() || null

  // ── 1. Assinaturas ────────────────────────────────────────────────────
  // `all`/`canceled` são os únicos recortes que olham o histórico; os demais
  // só interessam por assinatura viva ou em aberto.
  const statusFilter: VipSubscriptionStatus[] | null =
    params.filter === "past_due"
      ? ["past_due"]
      : params.filter === "pending"
        ? ["pending"]
        : params.filter === "subscribers"
          ? ["active", "past_due"]
          : params.filter === "canceled"
            ? ["canceled", "expired"]
            : params.filter === "aura_or_manual"
              ? [] // não há assinatura a buscar neste recorte
              : null // active_vips | all -> todas

  let subscriptions: SubscriptionRow[] = []
  if (statusFilter === null || statusFilter.length > 0) {
    let query = db.from("vip_subscriptions").select(SUBSCRIPTION_COLUMNS)
    if (statusFilter) query = query.in("status", statusFilter)
    const { data, error } = await query.order("updated_at", { ascending: false })
    if (error) throw error
    subscriptions = (data ?? []) as SubscriptionRow[]
  }

  // ── 2. Perfis VIP sem assinatura viva (Aura/manual) ────────────────────
  // Necessário porque esses VIPs não existem em `vip_subscriptions`. Buscamos
  // todo perfil `vip` e descartamos depois quem já veio pelo passo 1.
  const needsProfiles =
    params.filter === "active_vips" || params.filter === "aura_or_manual" || params.filter === "all"

  let vipProfiles: ProfileRow[] = []
  if (needsProfiles) {
    const { data, error } = await db
      .from("user_profiles")
      .select(PROFILE_COLUMNS)
      .eq("account_tier", "vip")
    if (error) throw error
    vipProfiles = (data ?? []) as ProfileRow[]
  }

  // ── 3. Perfis de todos os usuários envolvidos ─────────────────────────
  const profileById = new Map<string, ProfileRow>()
  for (const profile of vipProfiles) profileById.set(profile.id, profile)

  const missingProfileIds = subscriptions
    .map((s) => s.user_id)
    .filter((id) => !profileById.has(id))

  if (missingProfileIds.length > 0) {
    const { data, error } = await db
      .from("user_profiles")
      .select(PROFILE_COLUMNS)
      .in("id", Array.from(new Set(missingProfileIds)))
    if (error) throw error
    for (const profile of (data ?? []) as ProfileRow[]) profileById.set(profile.id, profile)
  }

  // ── 4. Uma linha por usuário ──────────────────────────────────────────
  // Quando alguém tem mais de uma linha de assinatura (não deveria —
  // `user_id` é UNIQUE — mas a consulta não depende disso), vence a mais
  // recentemente atualizada, que é a ordem em que vieram.
  const subscriptionByUser = new Map<string, SubscriptionRow>()
  for (const subscription of subscriptions) {
    if (!subscriptionByUser.has(subscription.user_id)) {
      subscriptionByUser.set(subscription.user_id, subscription)
    }
  }

  const userIds = new Set<string>([...subscriptionByUser.keys()])
  if (needsProfiles) {
    for (const profile of vipProfiles) userIds.add(profile.id)
  }

  // Moldura em LOTE para a página inteira — nunca uma consulta por linha.
  const frameOf = await getProfileFramesByUser([...userIds])

  let rows = Array.from(userIds).map((userId) => {
    const profile = profileById.get(userId)
    return buildRow(
      userId,
      profile,
      subscriptionByUser.get(userId),
      null,
      frameOf(userId, profile?.account_tier ?? null, profile?.vip_expires_at ?? null)
    )
  })

  // ── 5. Recortes que só podem ser decididos com a linha montada ────────
  if (params.filter === "active_vips") {
    rows = rows.filter((row) => row.vipActive)
  } else if (params.filter === "aura_or_manual") {
    // VIP valendo agora que NÃO vem de assinatura viva.
    rows = rows.filter((row) => row.vipActive && row.origin === "aura_or_manual")
  }

  if (search) {
    const term = search.toLowerCase()
    rows = rows.filter((row) => row.displayName.toLowerCase().includes(term))
  }

  // Ordena: VIP ativo primeiro, depois quem vence antes (o que o admin
  // precisa ver), e por fim quem não tem data (manual/vitalício).
  rows.sort((a, b) => {
    if (a.vipActive !== b.vipActive) return a.vipActive ? -1 : 1
    const aEnd = a.vipExpiresAt ? new Date(a.vipExpiresAt).getTime() : Number.POSITIVE_INFINITY
    const bEnd = b.vipExpiresAt ? new Date(b.vipExpiresAt).getTime() : Number.POSITIVE_INFINITY
    if (aEnd !== bEnd) return aEnd - bEnd
    return a.displayName.localeCompare(b.displayName, "pt-BR")
  })

  const total = rows.length
  const start = (page - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  // E-mail só da página exibida: são N chamadas ao Admin API, e buscar para a
  // lista inteira seria caro sem servir para nada que a tela mostre.
  const emails = await fetchEmails(pageRows.map((row) => row.userId))
  const withEmails = pageRows.map((row) => ({ ...row, email: emails.get(row.userId) ?? null }))

  return { rows: withEmails, total, hasMore: start + pageSize < total }
}

/**
 * Números do topo da tela. Contados sobre o conjunto inteiro (não sobre a
 * página), porque é isso que "quantos VIPs eu tenho" significa.
 */
export async function getVipAdminTotals(): Promise<VipAdminTotals> {
  const db = createSupabaseAdminClient()

  const [{ data: subscriptionData, error: subscriptionError }, { data: profileData, error: profileError }] =
    await Promise.all([
      // `billing_period` entra na consulta porque o MRR depende dele: um
      // assinante anual não contribui R$ 89,90 por mês.
      db.from("vip_subscriptions").select("user_id, status, billing_period"),
      db.from("user_profiles").select("id, account_tier, vip_expires_at").eq("account_tier", "vip"),
    ])
  if (subscriptionError) throw subscriptionError
  if (profileError) throw profileError

  const subscriptionsByUser = new Map<string, VipSubscriptionStatus>()
  const periodsByUser = new Map<string, VipBillingPeriod>()
  for (const row of (subscriptionData ?? []) as Array<{
    user_id: string
    status: VipSubscriptionStatus
    billing_period: string | null
  }>) {
    subscriptionsByUser.set(row.user_id, row.status)
    periodsByUser.set(row.user_id, parseVipBillingPeriod(row.billing_period))
  }

  let activeVips = 0
  let auraOrManual = 0
  for (const profile of (profileData ?? []) as ProfileRow[]) {
    if (!isVipActive(profile.account_tier, profile.vip_expires_at)) continue
    activeVips += 1
    const status = subscriptionsByUser.get(profile.id)
    if (!status || !isLiveSubscription(status)) auraOrManual += 1
  }

  let payingSubscribers = 0
  let pastDue = 0
  let pending = 0
  let yearlySubscribers = 0
  // Receita mensal RECORRENTE: cada assinatura contribui com o valor do seu
  // plano dividido pelos meses que ele cobre. O anual (R$ 89,90/12) entra como
  // ~R$ 7,49/mês. Somar o preço cheio de cada assinatura inflaria o MRR em 10×
  // por assinante anual; usar só o preço mensal para todos o subestimaria.
  let mrrCents = 0
  for (const [userId, status] of subscriptionsByUser) {
    if (isLiveSubscription(status)) {
      payingSubscribers += 1
      const plan = getVipPlan(periodsByUser.get(userId))
      if (plan.period === "yearly") yearlySubscribers += 1
      // `past_due` entra no MRR: a assinatura segue viva e a Asaas segue
      // tentando cobrar. Excluí-la subestimaria a receita esperada.
      mrrCents += plan.priceCents / plan.months
    }
    if (status === "past_due") pastDue += 1
    if (status === "pending") pending += 1
  }

  return {
    activeVips,
    payingSubscribers,
    pastDue,
    pending,
    auraOrManual,
    yearlySubscribers,
    mrrCents: Math.round(mrrCents),
  }
}

/** Uma assinatura pelo id da linha local — base da tela de detalhe. */
export async function getVipAdminDetail(userId: string): Promise<VipAdminRow | null> {
  const db = createSupabaseAdminClient()

  const [{ data: profile }, { data: subscriptions, error }] = await Promise.all([
    db.from("user_profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
    db
      .from("vip_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ])
  if (error) throw error
  if (!profile) return null

  const [emails, frameOf] = await Promise.all([
    fetchEmails([userId]),
    getProfileFramesByUser([userId]),
  ])
  const profileRow = profile as ProfileRow
  return buildRow(
    userId,
    profileRow,
    ((subscriptions ?? []) as SubscriptionRow[])[0],
    emails.get(userId) ?? null,
    frameOf(userId, profileRow.account_tier, profileRow.vip_expires_at)
  )
}

/**
 * Concede (ou estende) VIP manualmente.
 *
 * `months = null` concede VIP SEM EXPIRAÇÃO (`vip_expires_at = null`) — é o
 * VIP vitalício/de cargo, que `isVipActive` já trata como sempre válido.
 *
 * ESTENDE a partir do fim do VIP atual quando ele ainda vale, e a partir de
 * agora quando não vale: conceder 1 mês a quem tem 20 dias restantes tem de
 * resultar em 50 dias, não em 30 — senão a concessão do admin ENCURTARIA o
 * acesso de quem pagou, que é o oposto da intenção.
 *
 * Escreve `account_tier`/`vip_expires_at` via service_role, o único papel que
 * o trigger `guard_user_profiles_privileged_columns` deixa tocar nessas
 * colunas (ver 20261102000000_fix_privilege_escalation_rls.sql) — por isso
 * isto vive no servidor e nunca no client.
 *
 * NÃO mexe na assinatura da Asaas: conceder tempo é um brinde, não uma
 * cobrança. Se a pessoa tem assinatura viva, ela continua renovando normal.
 */
export async function grantVipManually(params: {
  userId: string
  /** Meses a somar. `null` = VIP sem expiração. */
  months: number | null
}): Promise<{ ok: true; expiresAt: string | null } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const { data: profile, error: profileError } = await db
    .from("user_profiles")
    .select("id, account_tier, vip_expires_at")
    .eq("id", params.userId)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile) return { ok: false, error: "Usuário não encontrado.", status: 404 }

  let expiresAt: string | null = null
  if (params.months !== null) {
    const current = profile.vip_expires_at
    const stillValid = isVipActive(profile.account_tier, current)
    // VIP sem expiração já é o maior acesso possível: somar meses a ele
    // criaria uma data de fim onde não havia nenhuma, ou seja, RETIRARIA o
    // vitalício. Nesse caso a concessão não tem o que fazer.
    if (stillValid && current === null) {
      return { ok: true, expiresAt: null }
    }
    const base = stillValid && current ? new Date(current) : new Date()
    base.setMonth(base.getMonth() + params.months)
    expiresAt = base.toISOString()
  }

  const { error } = await db
    .from("user_profiles")
    .update({ account_tier: "vip", vip_expires_at: expiresAt })
    .eq("id", params.userId)

  if (error) throw error
  return { ok: true, expiresAt }
}

/**
 * Revoga o VIP manualmente: rebaixa para `common` e zera a validade.
 *
 * NÃO cancela a assinatura na Asaas — são ações distintas de propósito.
 * Revogar sem cancelar deixaria a pessoa pagando sem acesso, então quem
 * chama (ver POST /api/admin/vips/[userId]/revoke) cancela a assinatura
 * antes, e a UI avisa disso.
 */
export async function revokeVipManually(userId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_profiles")
    .update({ account_tier: "common", vip_expires_at: null })
    .eq("id", userId)
  if (error) throw error
}

/**
 * Registra uma ação do admin sobre o VIP de alguém em `audit_log` — mesma
 * tabela e mesmo motivo de `deleteUserAsAdmin`: conceder ou revogar acesso
 * pago é ação sensível, e o UPDATE em `user_profiles` não preserva QUEM
 * clicou nem o estado anterior.
 *
 * Falha aqui NUNCA derruba a ação em si: perder a trilha é ruim, desfazer
 * uma concessão já aplicada por causa dela seria pior.
 */
export async function logVipAdminAction(params: {
  actorId: string
  targetUserId: string
  action:
    | "admin_vip_granted"
    | "admin_vip_revoked"
    | "admin_vip_subscription_canceled"
    | "admin_vip_subscription_synced"
  metadata: Record<string, unknown>
  ipAddress?: string | null
}): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("audit_log").insert({
    user_id: params.targetUserId,
    actor_id: params.actorId,
    action: params.action,
    table_name: "user_profiles",
    record_id: params.targetUserId,
    metadata: params.metadata,
    ip_address: params.ipAddress ?? null,
  })
  if (error) console.error("[vip-admin-repository] logVipAdminAction:", error)
}
