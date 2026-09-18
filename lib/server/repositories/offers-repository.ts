import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório de Ofertas — acesso à tabela `offers_votes`.
 *
 * As ofertas em si vêm do Telegram (`lib/server/integrations/telegram-offers`);
 * aqui ficam apenas os votos de "funcionou / não funcionou".
 */

export type OfferVoteSummary = {
  workingCounts: Record<string, number>
  userVoted: Set<string>
}

/** Conta votos positivos por oferta e marca quais o visitante atual já votou. */
export async function getOfferVoteSummary(
  offerIds: string[],
  voterHash: string | null
): Promise<OfferVoteSummary> {
  const summary: OfferVoteSummary = { workingCounts: {}, userVoted: new Set() }
  if (offerIds.length === 0) return summary

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("offers_votes")
    .select("offer_id, is_working, voter_hash")
    .in("offer_id", offerIds)

  if (error) {
    console.error("[offers-repository] getOfferVoteSummary:", error)
    throw error
  }

  for (const vote of (data ?? []) as Array<{
    offer_id: string
    is_working: boolean
    voter_hash: string
  }>) {
    if (vote.is_working) {
      summary.workingCounts[vote.offer_id] = (summary.workingCounts[vote.offer_id] ?? 0) + 1
    }
    if (voterHash && vote.voter_hash === voterHash) {
      summary.userVoted.add(vote.offer_id)
    }
  }
  return summary
}

/** Registra (upsert) o voto de um visitante numa oferta. */
export async function registerOfferVote(params: {
  offerId: string
  voterHash: string
  isWorking: boolean
}): Promise<void> {
  const db = createSupabaseAdminClient()
  const payload = {
    offer_id: params.offerId,
    voter_hash: params.voterHash,
    is_working: params.isWorking,
  }
  const { error } = await db
    .from("offers_votes")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: "offer_id,voter_hash" })

  if (error) {
    console.error("[offers-repository] registerOfferVote:", error)
    throw error
  }
}

// ── Cache persistente das ofertas (tabela `offers_cache`) ────────────────────
//
// O Telegram continua sendo a fonte de verdade; esta tabela é só um histórico
// com retenção de 5 dias, para que `/offers` mostre mais que as ~30 últimas
// mensagens do canal e sobreviva a uma quebra do scraping.

/** Shape das ofertas guardadas — espelha `TelegramOffer` da integração. */
export type CachedOffer = {
  id: string
  messageId: number
  text: string
  date: string
  author: string | null
  authorAvatar: { url: string; width: number | null; height: number | null } | null
  chatTitle: string | null
  url: string | null
  image: { url: string; width: number | null; height: number | null } | null
}

/** Dias mantidos na tabela. Precisa bater com o default de `prune_offers_cache`. */
export const OFFERS_RETENTION_DAYS = 5

/**
 * Grava as ofertas recém-raspadas e apaga as que passaram da retenção.
 *
 * O upsert sobrescreve texto/imagem de propósito: mensagem editada no canal
 * deve refletir aqui. Falha de escrita **não** propaga — a página já tem as
 * ofertas em mãos vindas do Telegram, e derrubar a request por causa do cache
 * seria trocar uma degradação invisível por um erro visível.
 */
export async function saveOffersToCache(offers: CachedOffer[]): Promise<void> {
  if (offers.length === 0) return

  const db = createSupabaseAdminClient()
  const rows = offers.map((offer) => ({
    id: offer.id,
    message_id: offer.messageId,
    text: offer.text,
    posted_at: offer.date,
    author: offer.author,
    author_avatar: offer.authorAvatar,
    chat_title: offer.chatTitle,
    url: offer.url,
    image: offer.image,
    last_seen_at: new Date().toISOString(),
  }))

  const { error } = await db
    .from("offers_cache")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: "id" })

  if (error) {
    console.error("[offers-repository] saveOffersToCache:", error)
    return
  }

  const { error: pruneError } = await db.rpc("prune_offers_cache", {
    retention_days: OFFERS_RETENTION_DAYS,
  })
  if (pruneError) {
    console.error("[offers-repository] prune_offers_cache:", pruneError)
  }
}

/**
 * Apaga do histórico mensagens que o scraping descartou (recado sem link,
 * resposta que antes era lida pela citação). Mesma política de falha de
 * `saveOffersToCache`: loga e segue, a página não cai por causa do cache.
 */
export async function removeOffersFromCache(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const db = createSupabaseAdminClient()
  const { error } = await db.from("offers_cache").delete().in("id", ids)
  if (error) {
    console.error("[offers-repository] removeOffersFromCache:", error)
  }
}

/**
 * Quando o scraping gravou pela última vez, ou `null` se a tabela está vazia.
 *
 * `last_seen_at` é tocado em todas as linhas a cada `saveOffersToCache`, então
 * o máximo dela é o relógio da última sincronização — sem precisar de tabela
 * de controle. É isso que deixa o cron pular a busca quando uma visita à
 * página já atualizou os dados há pouco.
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("offers_cache")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[offers-repository] getLastSyncedAt:", error)
    return null
  }
  return data?.last_seen_at ? new Date(data.last_seen_at) : null
}

/** Lê o histórico guardado, mais recente primeiro, já dentro da retenção. */
export async function getCachedOffers(limit: number): Promise<CachedOffer[]> {
  const db = createSupabaseAdminClient()
  const cutoff = new Date(Date.now() - OFFERS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from("offers_cache")
    .select("id, message_id, text, posted_at, author, author_avatar, chat_title, url, image")
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[offers-repository] getCachedOffers:", error)
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    messageId: Number(row.message_id),
    text: row.text,
    date: row.posted_at,
    author: row.author,
    authorAvatar: row.author_avatar,
    chatTitle: row.chat_title,
    url: row.url,
    image: row.image,
  }))
}
