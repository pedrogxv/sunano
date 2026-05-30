import "server-only"

import { unstable_cache } from "next/cache"

type TelegramChat = {
  id?: number
  title?: string
  username?: string
  type?: string
}

type TelegramPhotoSize = {
  file_id?: string
  width?: number
  height?: number
  file_size?: number
}

type TelegramDocument = {
  file_id?: string
  mime_type?: string
  file_name?: string
  file_size?: number
  thumb?: TelegramPhotoSize
}

type TelegramMessage = {
  message_id?: number
  date?: number
  text?: string
  caption?: string
  chat?: TelegramChat
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  from?: {
    id?: number
    first_name?: string
    username?: string
  }
}

type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage
  channel_post?: TelegramMessage
}

type TelegramGetUpdatesResponse = {
  ok?: boolean
  result?: TelegramUpdate[]
  description?: string
}

type TelegramGetUserProfilePhotosResponse = {
  ok?: boolean
  result?: {
    photos?: TelegramPhotoSize[][]
  }
  description?: string
}

type TelegramGetChatResponse = {
  ok?: boolean
  result?: {
    id?: number
    title?: string
    username?: string
    photo?: {
      small_file_id?: string
      big_file_id?: string
    }
  }
  description?: string
}

export type TelegramOfferImage = {
  fileId: string
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

function normalizeChatId(value: string | null | undefined) {
  if (!value) return null
  return value.trim()
}

function buildTelegramMessageUrl(message: TelegramMessage, fallbackUrl: string | null) {
  const username = message.chat?.username
  const messageId = message.message_id

  if (!messageId) return fallbackUrl
  if (username) return `https://t.me/${username}/${messageId}`
  if (!fallbackUrl) return null

  return `${fallbackUrl.replace(/\/$/, "")}/${messageId}`
}

function pickBestPhoto(photos?: TelegramPhotoSize[]) {
  if (!photos?.length) return null

  return photos.reduce((best, current) => {
    const bestScore = (best.file_size ?? 0) * 10 + (best.width ?? 0)
    const currentScore = (current.file_size ?? 0) * 10 + (current.width ?? 0)
    return currentScore > bestScore ? current : best
  }, photos[0])
}

function extractOfferImage(message: TelegramMessage): TelegramOfferImage | null {
  const bestPhoto = pickBestPhoto(message.photo)
  if (bestPhoto?.file_id) {
    return {
      fileId: bestPhoto.file_id,
      width: bestPhoto.width ?? null,
      height: bestPhoto.height ?? null,
    }
  }

  const document = message.document
  if (document?.file_id && document.mime_type?.startsWith("image/")) {
    return {
      fileId: document.file_id,
      width: document.thumb?.width ?? null,
      height: document.thumb?.height ?? null,
    }
  }

  return null
}

async function fetchChatPhoto(chatId: number, botToken: string): Promise<TelegramOfferImage | null> {
  const params = new URLSearchParams()
  params.set("chat_id", String(chatId))

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getChat?${params.toString()}`)
  const data = (await response.json().catch(() => null)) as TelegramGetChatResponse | null

  if (!response.ok || !data?.ok || !data.result?.photo) {
    return null
  }

  const fileId = data.result.photo.big_file_id || data.result.photo.small_file_id
  if (!fileId) return null

  return { fileId, width: null, height: null }
}

async function fetchUserProfilePhoto(userId: number, botToken: string): Promise<TelegramOfferImage | null> {
  const params = new URLSearchParams()
  params.set("user_id", String(userId))
  params.set("limit", "1")

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos?${params.toString()}`)
  const data = (await response.json().catch(() => null)) as TelegramGetUserProfilePhotosResponse | null

  if (!response.ok || !data?.ok) {
    return null
  }

  const firstPhotoSet = data.result?.photos?.[0]
  const bestPhoto = pickBestPhoto(firstPhotoSet)

  if (!bestPhoto?.file_id) {
    return null
  }

  return {
    fileId: bestPhoto.file_id,
    width: bestPhoto.width ?? null,
    height: bestPhoto.height ?? null,
  }
}

async function fetchTelegramOffers(limit = 30): Promise<TelegramOffersResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const configuredChatId = normalizeChatId(process.env.TELEGRAM_OFFERS_CHAT_ID)
  const fallbackPublicUrl = process.env.TELEGRAM_OFFERS_PUBLIC_URL?.trim() || null

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN não configurado.")
  }

  if (!configuredChatId) {
    throw new Error("TELEGRAM_OFFERS_CHAT_ID não configurado.")
  }

  const params = new URLSearchParams()
  params.set("limit", "100")
  params.set("allowed_updates", JSON.stringify(["message", "channel_post"]))

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`)
  const data = (await response.json()) as TelegramGetUpdatesResponse

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error (${response.status})`)
  }

  const messages = (data.result ?? [])
    .map((update) => update.message || update.channel_post)
    .filter((message): message is TelegramMessage => Boolean(message))
    .filter((message) => {
      const chat = message.chat
      if (!chat) return false

      if (configuredChatId.startsWith("@")) {
        return `@${chat.username || ""}`.toLowerCase() === configuredChatId.toLowerCase()
      }

      return String(chat.id || "") === configuredChatId
    })
    .filter((message) => {
      const text = (message.text || message.caption || "").trim()
      return text.length > 0
    })
    .sort((a, b) => (b.date || 0) - (a.date || 0))

  const visibleMessages = messages.slice(0, limit)

  const authorIds = Array.from(
    new Set(
      visibleMessages
        .map((message) => message.from?.id)
        .filter((id): id is number => typeof id === "number")
    )
  )
  const authorAvatarMap = new Map<number, TelegramOfferImage | null>()

  const chatIdsWithoutAuthor = Array.from(
    new Set(
      visibleMessages
        .filter((m) => !m.from?.id && typeof m.chat?.id === "number")
        .map((m) => m.chat!.id!)
    )
  )
  const chatPhotoMap = new Map<number, TelegramOfferImage | null>()

  await Promise.all([
    ...authorIds.map(async (authorId) => {
      const avatar = await fetchUserProfilePhoto(authorId, botToken)
      authorAvatarMap.set(authorId, avatar)
    }),
    ...chatIdsWithoutAuthor.map(async (chatId) => {
      const photo = await fetchChatPhoto(chatId, botToken)
      chatPhotoMap.set(chatId, photo)
    }),
  ])

  const offers = visibleMessages.map((message) => {
    const text = (message.text || message.caption || "").trim()
    const date = message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString()
    const image = extractOfferImage(message)
    const authorId = message.from?.id ?? null
    const chatId = message.chat?.id ?? null

    return {
      id: `telegram-${message.message_id || Math.random().toString(36).slice(2)}`,
      messageId: message.message_id || 0,
      text,
      date,
      author: message.from?.first_name || message.from?.username || message.chat?.title || null,
      authorAvatar: authorId
        ? (authorAvatarMap.get(authorId) ?? null)
        : chatId
          ? (chatPhotoMap.get(chatId) ?? null)
          : null,
      chatTitle: message.chat?.title || null,
      url: buildTelegramMessageUrl(message, fallbackPublicUrl),
      image,
    }
  })

  const warning =
    offers.length === 0
      ? "Nenhuma mensagem encontrada no grupo configurado. Verifique se o bot está no grupo e com permissões de leitura."
      : null

  return {
    offers,
    source: "telegram",
    warning,
  }
}

const getCachedTelegramOffers = unstable_cache(
  async (limit: number) => fetchTelegramOffers(limit),
  ["telegram-offers-v1"],
  { revalidate: 300 }
)

export async function getTelegramOffers(limit = 30): Promise<TelegramOffersResult> {
  return getCachedTelegramOffers(limit)
}
