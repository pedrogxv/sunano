import "server-only"

import { unstable_cache } from "next/cache"

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

const getCachedTelegramOffers = unstable_cache(
  async (limit: number) => fetchTelegramOffers(limit),
  ["telegram-offers-v2"],
  { revalidate: 300 }
)

export async function getTelegramOffers(limit = 30): Promise<TelegramOffersResult> {
  return getCachedTelegramOffers(limit)
}
