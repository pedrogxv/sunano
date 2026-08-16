import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { parseSlug } from "@/lib/format"
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
  "id, slug, medal_id, criteria_type, max_participants, current_count, aura_cost, active, start_date, end_date, medals ( name, description, icon_url, rarity )"

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
  active: boolean
  start_date: string
  end_date: string | null
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
    active: row.active,
    startDate: row.start_date,
    endDate: row.end_date,
  }
}

/** Todos os eventos (ativos e encerrados) para a página pública `/eventos`. */
export async function listActiveEventsForDisplay(): Promise<EventDisplay[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("events")
    .select(EVENT_SELECT)
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

/** Mesma listagem, para a tabela do admin. */
export async function listEventsForAdmin(): Promise<EventDisplay[]> {
  return listActiveEventsForDisplay()
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
}

/** Cria a medalha do evento e o evento em si (nessa ordem, por causa da FK). */
export async function createEvent(input: EventInput): Promise<EventDisplay> {
  if (input.criteriaType !== "aura_redeem" && !input.maxParticipants) {
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
      active: true,
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

  if (current.criteria_type !== "aura_redeem" && input.maxParticipants === null) {
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
  if (input.active !== undefined) eventUpdate.active = input.active
  eventUpdate.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventError } = await (db.from("events") as any).update(eventUpdate).eq("id", id)
  if (eventError) throw eventError

  return getEventForAdmin(id)
}

export async function deleteEvent(id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  // A medalha do evento não é apagada: quem já ganhou continua com ela no perfil.
  await db.from("events").delete().eq("id", id)
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
  | { ok: false; reason: "not_found" | "not_manual" | "unavailable" | "insufficient_aura" }

/**
 * Resgate manual, disparado pelo clique do usuário em `/eventos`
 * (`POST /api/eventos/[id]/claim`). Só eventos `manual_opt_in` e
 * `aura_redeem` podem ser resgatados assim — `first_n_signups` continua
 * exclusivo de `awardEligibleEventMedals`, chamado no login/cadastro.
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
    .select("criteria_type")
    .eq("id", eventId)
    .maybeSingle()

  if (error || !row) return { ok: false, reason: "not_found" }
  if (row.criteria_type !== "manual_opt_in" && row.criteria_type !== "aura_redeem") {
    return { ok: false, reason: "not_manual" }
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
