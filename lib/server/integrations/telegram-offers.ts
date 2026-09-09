import "server-only"

import { unstable_cache } from "next/cache"

import {
  getCachedOffers,
  getLastSyncedAt,
  OFFERS_RETENTION_DAYS,
  saveOffersToCache,
} from "@/lib/server/repositories/offers-repository"

/**
 * Lê as ofertas direto da página pública de preview do canal (t.me/s/<canal>)
 * em vez de usar a Bot API (getUpdates). O canal é público e não é operado
 * por este app — outro serviço já usa esse bot com um webhook próprio, então
 * getUpdates entra em conflito com ele. Fazer scraping da página pública não
 * depende de bot nem de token nenhum.
 */

export type TelegramOfferImage = {
  url: string
  width: number | null
  height: number | null
}

export type TelegramOffer = {
  id: string
  messageId: number
  text: string
  date: string
  author: string | null
  authorAvatar: TelegramOfferImage | null
  chatTitle: string | null
  url: string | null
  image: TelegramOfferImage | null
}

export type TelegramOffersResult = {
  offers: TelegramOffer[]
  source: "telegram"
  warning: string | null
}

/**
 * Teto de ofertas devolvidas ao cliente. Com ~30 posts/dia no canal e 5 dias
 * de retenção, ~200 cobre a janela inteira com folga — o `limit` do scraping
 * segue separado, porque ele só precisa alcançar o que é novo desde a última
 * passada.
 */
const HISTORY_LIMIT = OFFERS_RETENTION_DAYS * 40

/**
 * Idade máxima dos dados para considerá-los "frescos". Bate com o
 * `revalidate` do `unstable_cache` abaixo de propósito: dentro dessa janela a
 * leitura da página não iria ao Telegram de qualquer forma, então o cron
 * também não precisa ir.
 */
const FRESH_WINDOW_MS = 5 * 60 * 1000

/**
 * Quantas mensagens buscar do canal por passada. Só precisa cobrir o que é
 * novo desde a última sincronização — a 15 min, o canal (~30 posts/dia) produz
 * menos de uma mensagem, então 30 é folga enorme. Não confundir com
 * `HISTORY_LIMIT`, que é quanto se devolve ao cliente.
 */
export const SCRAPE_LIMIT = 30

type ParsedMessage = {
  messageId: number
  date: string
  text: string
  image: TelegramOfferImage | null
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeHtmlEntities(input: string) {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match
  })
}

function htmlToText(html: string) {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim()
}

function getChannelUsername(): string | null {
  const configuredChatId = process.env.TELEGRAM_OFFERS_CHAT_ID?.trim()
  if (configuredChatId?.startsWith("@")) return configuredChatId.slice(1)

  const publicUrl = process.env.TELEGRAM_OFFERS_PUBLIC_URL?.trim()
  const match = publicUrl?.match(/t\.me\/(?:s\/)?([a-zA-Z0-9_]+)/)
  return match?.[1] ?? null
}

function extractChannelMeta(html: string) {
  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/)
  const imageMatch = html.match(/<meta property="og:image" content="([^"]*)"/)
  return {
    title: titleMatch ? decodeHtmlEntities(titleMatch[1]) : null,
    avatarUrl: imageMatch?.[1] ?? null,
  }
}

function parseChannelPage(html: string, username: string): ParsedMessage[] {
  const startRe = /<div class="tgme_widget_message[^"]*"\s+data-post="([a-zA-Z0-9_]+)\/(\d+)"/g
  const starts: { index: number; username: string; messageId: number }[] = []

  let match: RegExpExecArray | null
  while ((match = startRe.exec(html))) {
    starts.push({ index: match.index, username: match[1], messageId: Number(match[2]) })
  }

  const messages: ParsedMessage[] = []

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i]
    if (current.username !== username) continue

    const end = i + 1 < starts.length ? starts[i + 1].index : html.length
    const chunk = html.slice(current.index, end)

    const textMatch = chunk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    const text = textMatch ? htmlToText(textMatch[1]) : ""
    if (!text) continue

    const dateMatch = chunk.match(/<time datetime="([^"]+)"/)
    const photoMatch = chunk.match(
      /tgme_widget_message_photo_wrap[^"]*"\s+href="[^"]*"\s+style="width:(\d+)px;background-image:url\('([^']+)'\)"/
    )

    messages.push({
      messageId: current.messageId,
      date: dateMatch ? dateMatch[1] : new Date().toISOString(),
      text,
      image: photoMatch ? { url: photoMatch[2], width: Number(photoMatch[1]), height: null } : null,
    })
  }

  return messages
}

async function fetchChannelPage(username: string, before?: number): Promise<string> {
  const url = new URL(`https://t.me/s/${username}`)
  if (before) url.searchParams.set("before", String(before))

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SunanoOffers/1.0)" },
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    throw new Error(`Telegram preview indisponível (HTTP ${response.status}).`)
  }

  return response.text()
}

async function fetchTelegramOffers(limit = 30): Promise<TelegramOffersResult> {
  const username = getChannelUsername()
  if (!username) {
    throw new Error(
      "Canal público do Telegram não configurado. Defina TELEGRAM_OFFERS_PUBLIC_URL (ex: https://t.me/seucanal)."
    )
  }

  const collected: ParsedMessage[] = []
  let before: number | undefined
  let channelTitle: string | null = null
  let channelAvatarUrl: string | null = null

  const MAX_PAGES = 4
  for (let page = 0; page < MAX_PAGES && collected.length < limit; page++) {
    const html = await fetchChannelPage(username, before)

    if (page === 0) {
      const meta = extractChannelMeta(html)
      channelTitle = meta.title
      channelAvatarUrl = meta.avatarUrl
    }

    const pageMessages = parseChannelPage(html, username)
    if (pageMessages.length === 0) break

    collected.push(...pageMessages)
    before = pageMessages[0].messageId
  }

  const sorted = collected.sort((a, b) => b.messageId - a.messageId).slice(0, limit)
  const authorAvatar: TelegramOfferImage | null = channelAvatarUrl
    ? { url: channelAvatarUrl, width: null, height: null }
    : null

  const offers: TelegramOffer[] = sorted.map((message) => ({
    id: `telegram-${message.messageId}`,
    messageId: message.messageId,
    text: message.text,
    date: message.date,
    author: channelTitle,
    authorAvatar,
    chatTitle: channelTitle,
    url: `https://t.me/${username}/${message.messageId}`,
    image: message.image,
  }))

  const warning =
    offers.length === 0
      ? "Nenhuma mensagem encontrada no canal configurado. Verifique se o nome de usuário está correto."
      : null

  return {
    offers,
    source: "telegram",
    warning,
  }
}

/**
 * Só o scraping é memoizado. A gravação no banco fica de fora de propósito:
 * `unstable_cache` não permite escrita durante o render do valor cacheado, e
 * num cache hit não haveria nada novo pra gravar de qualquer forma.
 */
const getCachedTelegramScrape = unstable_cache(
  async (limit: number) => fetchTelegramOffers(limit),
  ["telegram-offers-v2"],
  { revalidate: 300 }
)

/**
 * Ofertas do Telegram combinadas com o histórico persistido.
 *
 * O scraping só alcança as ~30 últimas mensagens do canal (≈1 dia, no ritmo
 * atual de ~30 posts/dia). O que o usuário vê como "sumiu oferta" é isso: a
 * janela do canal, não uma limpeza. Aqui o resultado do scraping é gravado em
 * `offers_cache` e depois unido ao que já estava guardado, devolvendo até
 * `OFFERS_RETENTION_DAYS` dias de ofertas.
 *
 * Degradação: se o Telegram cair ou o markup mudar, cai no histórico do banco
 * em vez de estourar — o erro só sobe se as duas fontes falharem.
 */
export async function getTelegramOffers(limit = SCRAPE_LIMIT): Promise<TelegramOffersResult> {
  let scraped: TelegramOffersResult | null = null
  let scrapeError: unknown = null

  // Com o cron mantendo a tabela em dia, o caminho normal é o banco já estar
  // fresco — aí a request do usuário não toca o Telegram e responde direto do
  // Postgres. O scraping aqui vira só a rede de segurança pra quando o cron
  // não rodou (deploy novo, cron falhando, ambiente sem CRON_SECRET).
  const lastSyncedAt = await getLastSyncedAt()
  const isFresh = lastSyncedAt !== null && Date.now() - lastSyncedAt.getTime() < FRESH_WINDOW_MS

  if (!isFresh) {
    try {
      scraped = await getCachedTelegramScrape(limit)
      if (scraped.offers.length > 0) {
        await saveOffersToCache(scraped.offers)
      }
    } catch (error) {
      scrapeError = error
      console.error("[telegram-offers] scraping falhou, caindo no cache do banco:", error)
    }
  }

  // O histórico já contém o que acabou de ser gravado; o merge abaixo existe
  // só pro caso da escrita ter falhado silenciosamente (ver saveOffersToCache).
  let stored: TelegramOffer[] = []
  try {
    stored = await getCachedOffers(HISTORY_LIMIT)
  } catch (error) {
    console.error("[telegram-offers] leitura do cache falhou:", error)
    if (scrapeError) throw scrapeError
  }

  const byId = new Map<string, TelegramOffer>()
  for (const offer of stored) byId.set(offer.id, offer)
  // O scraping vence no empate: é a versão mais fresca da mensagem.
  for (const offer of scraped?.offers ?? []) byId.set(offer.id, offer)

  const offers = [...byId.values()]
    .sort((a, b) => b.messageId - a.messageId)
    .slice(0, HISTORY_LIMIT)

  const warning = scrapeError
    ? offers.length > 0
      ? "Não foi possível atualizar as ofertas agora — mostrando as últimas guardadas."
      : "Não foi possível carregar as ofertas agora. Tente novamente em alguns instantes."
    : offers.length === 0
      ? "Nenhuma mensagem encontrada no canal configurado. Verifique se o nome de usuário está correto."
      : null

  return { offers, source: "telegram", warning }
}

export type SyncResult = {
  /** `false` quando os dados já estavam frescos e nada foi buscado. */
  synced: boolean
  /** Ofertas gravadas nesta passada. Zero quando `synced` é falso. */
  saved: number
  /** Idade dos dados no momento da checagem, em segundos. */
  ageSeconds: number | null
  reason: "fresh" | "stale" | "empty" | "failed"
}

/**
 * Busca do Telegram e grava — o caminho do cron.
 *
 * Diferente de `getTelegramOffers`, esta função **não lê** o histórico nem
 * monta resposta pro cliente: ela só mantém a tabela em dia. E pula o trabalho
 * quando alguém já visitou a página há menos de `FRESH_WINDOW_MS`, porque
 * nesse caso o scraping já rodou e ir de novo ao Telegram seria puro
 * desperdício (mesma janela do cache de leitura).
 *
 * `force` ignora a checagem de frescor — útil pra disparo manual.
 */
export async function syncTelegramOffers(force = false): Promise<SyncResult> {
  const lastSyncedAt = await getLastSyncedAt()
  const ageMs = lastSyncedAt ? Date.now() - lastSyncedAt.getTime() : null
  const ageSeconds = ageMs === null ? null : Math.round(ageMs / 1000)

  if (!force && ageMs !== null && ageMs < FRESH_WINDOW_MS) {
    return { synced: false, saved: 0, ageSeconds, reason: "fresh" }
  }

  try {
    // Sem `unstable_cache` aqui: o cron existe justamente pra ir à fonte. Usar
    // o cache de leitura faria o cron devolver o mesmo valor memoizado e nunca
    // capturar mensagem nova.
    const result = await fetchTelegramOffers(SCRAPE_LIMIT)
    if (result.offers.length === 0) {
      return { synced: false, saved: 0, ageSeconds, reason: "empty" }
    }

    await saveOffersToCache(result.offers)
    return {
      synced: true,
      saved: result.offers.length,
      ageSeconds,
      reason: lastSyncedAt ? "stale" : "empty",
    }
  } catch (error) {
    console.error("[telegram-offers] sync falhou:", error)
    return { synced: false, saved: 0, ageSeconds, reason: "failed" }
  }
}
