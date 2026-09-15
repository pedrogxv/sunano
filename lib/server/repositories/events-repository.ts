import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { parseSlug } from "@/lib/format"
import { isVipActive, profileMediaProxyUrl } from "@/lib/account-tier"
import { escapeLikePattern, escapeOrFilterValue } from "@/lib/server/repositories/_shared"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"
import type { MedalRarity } from "@/lib/profile-showcase"
import type { EventCriteriaType, EventDisplay } from "@/lib/events"

/**
 * Repositório dos Eventos (campanhas que concedem medalhas automaticamente).
 *
 * `events` não guarda nome/descrição/imagem — esses campos vivem só em
 * `medals` (catálogo já existente) e chegam aqui via join. Ver
 * `supabase/migrations/20260804_events.sql`.
 */

const EVENT_SELECT =
  "id, slug, medal_id, criteria_type, max_participants, current_count, aura_cost, requires_vip, active, start_date, end_date, sort_order, medals ( name, description, icon_url, rarity )"

type MedalJoin = {
  name: string
  description: string | null
  icon_url: string | null
  rarity: MedalRarity
}

type EventRow = {
  id: string
  slug: string
  medal_id: string
  criteria_type: EventCriteriaType
  max_participants: number | null
  current_count: number
  aura_cost: number | null
  requires_vip: boolean
  active: boolean
  start_date: string
  end_date: string | null
  sort_order: number
  medals: MedalJoin | MedalJoin[] | null
}

function toEventDisplay(row: EventRow): EventDisplay | null {
  const medal = Array.isArray(row.medals) ? row.medals[0] : row.medals
  if (!medal) return null
  return {
    id: row.id,
    slug: row.slug,
    medalId: row.medal_id,
    name: medal.name,
    description: medal.description,
    imageUrl: medal.icon_url,
    rarity: medal.rarity,
    criteriaType: row.criteria_type,
    maxParticipants: row.max_participants,
    currentCount: row.current_count,
    auraCost: row.aura_cost,
    requiresVip: row.requires_vip,
    active: row.active,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
  }
}

/** Todos os eventos (ativos e encerrados) para a página pública `/eventos`. */
async function fetchActiveEventsForDisplay(): Promise<EventDisplay[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("events")
    .select(EVENT_SELECT)
    .order("sort_order", { ascending: true })
    .order("start_date", { ascending: false })

  if (error) {
    console.error("[events-repository] listActiveEventsForDisplay:", error)
    return []
  }

  return ((data ?? []) as unknown as EventRow[]).flatMap((row) => {
    const event = toEventDisplay(row)
    return event ? [event] : []
  })
}

/**
 * `unstable_cache` (5 min): a lista de eventos é igual para todo mundo e muda
 * só quando um admin edita, mas era relida a cada pageview de `/conquistas`
 * — que é `force-dynamic` por causa do progresso individual (medalhas
 * resgatadas, saldo de aura), não por causa desta query.
 */
/**
 * `{ expire: 0 }` no `revalidateTag` = expira agora. O `updateTag` (que
 * dispensa o segundo argumento) só funciona dentro de Server Action, e estas
 * escritas vêm de Route Handler — ver app/api/admin/events/**.
 */
const EVENTS_LIST_TAG = "events:list"

const getCachedActiveEvents = unstable_cache(
  fetchActiveEventsForDisplay,
  ["events-repository:activeEventsForDisplay"],
  { revalidate: 300, tags: [EVENTS_LIST_TAG] }
)

export function listActiveEventsForDisplay(): Promise<EventDisplay[]> {
  return getCachedActiveEvents()
}

/**
 * Mesma listagem, para a tabela do admin — sem passar pelo cache: quem acabou
 * de salvar um evento precisa ver a mudança na hora, não em até 5 minutos.
 */
export async function listEventsForAdmin(): Promise<EventDisplay[]> {
  return fetchActiveEventsForDisplay()
}

export async function getEventForAdmin(id: string): Promise<EventDisplay | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("[events-repository] getEventForAdmin:", error)
    return null
  }

  return toEventDisplay(data as unknown as EventRow)
}

/** Gera um slug único numa tabela, reaproveitando o padrão de `POST /api/admin/store/products`. */
async function uniqueSlug(table: "medals" | "events", base: string): Promise<string> {
  const db = createSupabaseAdminClient()
  let slug = parseSlug(base)
  const { data: existing } = await db.from(table).select("slug").like("slug", `${slug}%`)
  if (existing && existing.length > 0) {
    slug = `${slug}-${Date.now()}`
  }
  return slug
}

export type EventInput = {
  name: string
  description: string | null
  imageUrl: string | null
  rarity: MedalRarity
  maxParticipants: number | null
  criteriaType: EventCriteriaType
  auraCost: number | null
  requiresVip: boolean
}

/** Vagas viram teto opcional pra aura_redeem (custo dita quem pode) e staff_grant (a Staff que decide). */
function requiresMaxParticipants(criteriaType: EventCriteriaType): boolean {
  return criteriaType !== "aura_redeem" && criteriaType !== "staff_grant"
}

/** Cria a medalha do evento e o evento em si (nessa ordem, por causa da FK). */
export async function createEvent(input: EventInput): Promise<EventDisplay> {
  if (requiresMaxParticipants(input.criteriaType) && !input.maxParticipants) {
    throw new Error("Informe o número de vagas.")
  }
  if (input.criteriaType === "aura_redeem" && !input.auraCost) {
    throw new Error("Informe o custo em Aura do resgate.")
  }

  const db = createSupabaseAdminClient()

  const medalSlug = await uniqueSlug("medals", input.name)
  const { data: medal, error: medalError } = await db
    .from("medals")
    .insert({
      slug: medalSlug,
      name: input.name,
      description: input.description,
      icon_url: input.imageUrl,
      rarity: input.rarity,
    })
    .select()
    .single()

  if (medalError || !medal) {
    throw medalError ?? new Error("Erro ao criar a medalha do evento.")
  }

  // Fim da fila: maior sort_order existente + 1, mesmo padrão de
  // store-banners-repository.ts.
  const { data: last } = await db
    .from("events")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const eventSlug = await uniqueSlug("events", input.name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event, error: eventError } = await (db.from("events") as any)
    .insert({
      slug: eventSlug,
      medal_id: medal.id,
      criteria_type: input.criteriaType,
      max_participants: input.maxParticipants,
      // Nunca persiste custo de aura fora do tipo aura_redeem, mesmo que o
      // payload informe um por engano.
      aura_cost: input.criteriaType === "aura_redeem" ? input.auraCost : null,
      // staff_grant já é escolha a dedo da Staff — requires_vip não se aplica.
      requires_vip: input.criteriaType === "staff_grant" ? false : input.requiresVip,
      active: true,
      sort_order: ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1,
    })
    .select(EVENT_SELECT)
    .single()

  if (eventError || !event) {
    // A medalha já foi criada — remove pra não deixar lixo órfão sem evento.
    await db.from("medals").delete().eq("id", medal.id)
    throw eventError ?? new Error("Erro ao criar o evento.")
  }

  const display = toEventDisplay(event as unknown as EventRow)
  if (!display) throw new Error("Erro ao montar o evento criado.")
  revalidateTag(EVENTS_LIST_TAG, { expire: 0 })
  return display
}

export type EventUpdateInput = Partial<EventInput> & { active?: boolean }

export async function updateEvent(id: string, input: EventUpdateInput): Promise<EventDisplay | null> {
  const db = createSupabaseAdminClient()

  const { data: current, error: currentError } = await db
    .from("events")
    .select("medal_id, criteria_type")
    .eq("id", id)
    .maybeSingle()

  if (currentError || !current) {
    if (currentError) console.error("[events-repository] updateEvent (lookup):", currentError)
    return null
  }

  if (requiresMaxParticipants(current.criteria_type) && input.maxParticipants === null) {
    throw new Error("Informe o número de vagas.")
  }
  if (current.criteria_type === "aura_redeem" && input.auraCost === null) {
    throw new Error("Informe o custo em Aura do resgate.")
  }

  const medalUpdate: Record<string, unknown> = {}
  if (input.name !== undefined) medalUpdate.name = input.name
  if (input.description !== undefined) medalUpdate.description = input.description
  if (input.imageUrl !== undefined) medalUpdate.icon_url = input.imageUrl
  if (input.rarity !== undefined) medalUpdate.rarity = input.rarity

  if (Object.keys(medalUpdate).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("medals") as any).update(medalUpdate).eq("id", current.medal_id)
    if (error) throw error
  }

  const eventUpdate: Record<string, unknown> = {}
  if (input.maxParticipants !== undefined) eventUpdate.max_participants = input.maxParticipants
  if (input.auraCost !== undefined) eventUpdate.aura_cost = input.auraCost
  // staff_grant já é escolha a dedo da Staff — requires_vip não se aplica.
  if (input.requiresVip !== undefined) {
    eventUpdate.requires_vip = current.criteria_type === "staff_grant" ? false : input.requiresVip
  }
  if (input.active !== undefined) eventUpdate.active = input.active
  eventUpdate.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventError } = await (db.from("events") as any).update(eventUpdate).eq("id", id)
  if (eventError) throw eventError

  revalidateTag(EVENTS_LIST_TAG, { expire: 0 })
  return getEventForAdmin(id)
}

/** Recebe todos os ids na ordem desejada e regrava `sort_order` com o índice de cada um. */
export async function reorderEvents(orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from("events") as any).update({ sort_order: index }).eq("id", id)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[events-repository] reorderEvents:", failed.error)
    throw failed.error
  }

  revalidateTag(EVENTS_LIST_TAG, { expire: 0 })
}

export async function deleteEvent(id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  // A medalha do evento não é apagada: quem já ganhou continua com ela no perfil.
  await db.from("events").delete().eq("id", id)
  revalidateTag(EVENTS_LIST_TAG, { expire: 0 })
}

/** IDs das medalhas que o usuário já possui — usado em `/eventos` para marcar quais já foram resgatadas. */
export async function getClaimedMedalIds(userId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("user_medals").select("medal_id").eq("user_id", userId)
  if (error || !data) return []
  return data.map((row) => row.medal_id)
}

export type ClaimEventResult =
  | { ok: true; event: EventDisplay }
  | { ok: false; reason: "not_found" | "not_manual" | "unavailable" | "insufficient_aura" | "vip_required" }

/**
 * Resgate manual, disparado pelo clique do usuário em `/eventos`
 * (`POST /api/eventos/[id]/claim`). Só eventos `manual_opt_in` e
 * `aura_redeem` podem ser resgatados assim — `first_n_signups` continua
 * exclusivo de `awardEligibleEventMedals`, chamado no login/cadastro, e
 * `staff_grant` exclusivo de `grantEventMedalToUser`.
 *
 * A concessão em si reaproveita `claim_event_medal`: a função já é atômica
 * (trava a linha do evento) e idempotente (clique duplicado não conta vaga
 * duas vezes). Pra `aura_redeem` ela também debita a Aura do usuário na
 * mesma transação (20260816_aura_redeem_events.sql) — o gate de critério
 * abaixo só decide quem pode chamá-la, não como ela se comporta.
 */
export async function claimEventManually(userId: string, eventId: string): Promise<ClaimEventResult> {
  const db = createSupabaseAdminClient()

  const { data: row, error } = await db
    .from("events")
    .select("criteria_type, requires_vip")
    .eq("id", eventId)
    .maybeSingle()

  if (error || !row) return { ok: false, reason: "not_found" }
  if (row.criteria_type !== "manual_opt_in" && row.criteria_type !== "aura_redeem") {
    return { ok: false, reason: "not_manual" }
  }

  // Checagem só pra devolver um motivo específico ("precisa ser VIP" em vez
  // de "indisponível") — quem realmente barra é o gate dentro de
  // claim_event_medal, que roda de novo logo abaixo.
  if (row.requires_vip) {
    const { data: profile } = await db
      .from("user_profiles")
      .select("account_tier, vip_expires_at")
      .eq("id", userId)
      .maybeSingle()
    if (!profile || !isVipActive(profile.account_tier, profile.vip_expires_at)) {
      return { ok: false, reason: "vip_required" }
    }
  }

  const { data: claimed, error: rpcError } = await db.rpc("claim_event_medal", {
    p_event_id: eventId,
    p_user_id: userId,
  })
  if (rpcError) {
    if (rpcError.message?.includes("insufficient_aura_balance")) {
      return { ok: false, reason: "insufficient_aura" }
    }
    throw rpcError
  }
  if (!claimed) return { ok: false, reason: "unavailable" }

  const event = await getEventForAdmin(eventId)
  if (!event) return { ok: false, reason: "not_found" }
  return { ok: true, event }
}

export async function awardEligibleEventMedals(userId: string): Promise<void> {
  try {
    const db = createSupabaseAdminClient()
    const { data: events, error } = await db
      .from("events")
      .select("id")
      .eq("active", true)
      .eq("criteria_type", "first_n_signups")

    if (error || !events || events.length === 0) return

    // `claim_event_medal` é atômica e idempotente por evento — eventos
    // diferentes não compartilham estado entre si, então rodam em paralelo
    // em vez de round-trip por round-trip a cada login/cadastro.
    await Promise.all(
      events.map((event) => db.rpc("claim_event_medal", { p_event_id: event.id, p_user_id: userId }))
    )
  } catch (err) {
    console.error("[events-repository] awardEligibleEventMedals:", err)
  }
}

export type GrantEventResult =
  | { ok: true; event: EventDisplay }
  | { ok: false; reason: "not_found" | "not_staff_grant" | "unavailable" }

/**
 * Concessão manual de um evento `staff_grant` — a Staff escolhe o usuário na
 * tela de edição da conquista (`StaffGrantPanel`), ninguém resgata sozinho.
 * Reaproveita o mesmo esqueleto atômico/idempotente de `claim_event_medal`,
 * só que na RPC `grant_event_medal` (sem gate de VIP: quem concede já está
 * escolhendo a dedo).
 */
export async function grantEventMedalToUser(
  eventId: string,
  userId: string,
  grantedBy: string
): Promise<GrantEventResult> {
  const db = createSupabaseAdminClient()

  const { data: row, error } = await db
    .from("events")
    .select("criteria_type")
    .eq("id", eventId)
    .maybeSingle()

  if (error || !row) return { ok: false, reason: "not_found" }
  if (row.criteria_type !== "staff_grant") return { ok: false, reason: "not_staff_grant" }

  const { data: granted, error: rpcError } = await db.rpc("grant_event_medal", {
    p_event_id: eventId,
    p_user_id: userId,
    p_granted_by: grantedBy,
  })
  if (rpcError) throw rpcError
  if (!granted) return { ok: false, reason: "unavailable" }

  const event = await getEventForAdmin(eventId)
  if (!event) return { ok: false, reason: "not_found" }
  return { ok: true, event }
}

export type GrantableUser = {
  id: string
  displayName: string | null
  displaySlug: string
  avatarUrl: string | null
}

/**
 * Candidatos a receber uma medalha `staff_grant` — busca por nome/slug em
 * `user_profiles`, excluindo quem já tem essa medalha. Mesmo padrão de
 * `searchOrderCustomers` (orders-repository.ts): `ilike` escapado nos dois
 * campos via `.or()`.
 */
export async function searchGrantableUsers(
  query: string,
  medalId: string,
  limit = 20
): Promise<GrantableUser[]> {
  const term = query.trim()
  if (!term) return []

  const db = createSupabaseAdminClient()

  const { data: alreadyGranted } = await db.from("user_medals").select("user_id").eq("medal_id", medalId)
  const excludeIds = new Set((alreadyGranted ?? []).map((row) => row.user_id))

  const escaped = escapeOrFilterValue(escapeLikePattern(term))
  const { data, error } = await db
    .from("user_profiles")
    .select("id, display_name, display_slug, avatar_url")
    .or(`display_name.ilike."%${escaped}%",display_slug.ilike."%${escaped}%"`)
    .limit(limit + excludeIds.size)

  if (error || !data) {
    console.error("[events-repository] searchGrantableUsers:", error)
    return []
  }

  return (data as Array<{ id: string; display_name: string | null; display_slug: string; avatar_url: string | null }>)
    .filter((row) => !excludeIds.has(row.id))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      displayName: row.display_name,
      displaySlug: row.display_slug,
      // Nunca a coluna crua — ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
      avatarUrl: row.avatar_url ? profileMediaProxyUrl(row.id, "avatar") : null,
    }))
}

export type EventRecipient = {
  userId: string
  displayName: string | null
  avatarUrl: string | null
  awardedAt: string
  grantedBy: string | null
}

/** Quem já recebeu a medalha de um evento `staff_grant`, mais recente primeiro. */
export async function listEventRecipients(medalId: string): Promise<EventRecipient[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_medals")
    .select("user_id, awarded_at, granted_by")
    .eq("medal_id", medalId)
    .order("awarded_at", { ascending: false })

  if (error || !data) return []

  const rows = data as Array<{ user_id: string; awarded_at: string; granted_by: string | null }>
  const profiles = await getUserProfiles(rows.map((row) => row.user_id))

  return rows.map((row) => ({
    userId: row.user_id,
    displayName: profiles[row.user_id]?.display_name ?? null,
    avatarUrl: profiles[row.user_id]?.avatar_url ?? null,
    awardedAt: row.awarded_at,
    grantedBy: row.granted_by,
  }))
}
