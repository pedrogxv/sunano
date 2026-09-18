import "server-only"

import { unstable_cache } from "next/cache"

import { hasOfferLink } from "@/lib/offer-parser"
import {
  getCachedOffers,
  getLastSyncedAt,
  OFFERS_RETENTION_DAYS,
  removeOffersFromCache,
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

type ScrapeResult = TelegramOffersResult & {
  /**
   * Ids das mensagens que o scraping viu e descartou. Servem pra apagar do
   * histórico o que foi gravado antes de a regra existir (ou antes do
   * conserto da citação de resposta): sem isso a linha errada ficava na tela
   * até vencer a retenção.
   */
  rejectedIds: string[]
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

/**
 * Âncora cujo texto NÃO é a própria URL ("[Cuponomia aqui](https://...)").
 *
 * Tirar as tags deixaria só "Cuponomia aqui", e a mensagem ficaria sem link
 * nenhum: sem botão de "Ver oferta" e, com o filtro de recado, jogada fora
 * como se fosse spam. Aqui a URL vai junto, entre parênteses.
 */
const ANCHOR_RE = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

/** Menção e hashtag viram link pro próprio Telegram: a URL ali não é oferta. */
const TELEGRAM_HREF_RE = /^https?:\/\/(?:t\.me|telegram\.(?:org|me))\//i

function expandAnchors(html: string) {
  return html.replace(ANCHOR_RE, (match, href: string, inner: string) => {
    const label = decodeHtmlEntities(inner.replace(/<[^>]+>/g, "")).trim()
    if (!label) return match
    // Menção (@fulano) e hashtag viram link do próprio Telegram: não é loja.
    if (TELEGRAM_HREF_RE.test(href) || label.startsWith("@") || label.startsWith("#")) return match
    // Texto já é a própria URL, às vezes sem o "https://" ou cortada com
    // reticências pelo preview.
    const bare = (url: string) => url.replace(/^https?:\/\//i, "").replace(/…$/, "")
    if (bare(href).startsWith(bare(label))) return href
    return `${label} (${href})`
  })
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    expandAnchors(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  ).trim()
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

/**
 * Texto PRÓPRIO da mensagem.
 *
 * Resposta a outra mensagem traz a citação antes, numa div com a mesma classe
 * base (`tgme_widget_message_text js-message_reply_text`). Casar só pela base
 * pegava a citação: o "Quente" respondendo a uma oferta virava uma cópia
 * dela, sem quebra de linha (o preview achata a citação) e sem imagem (a foto
 * é da mensagem original), e o card aparecia duplicado.
 */
const OWN_TEXT_RE =
  /<div class="tgme_widget_message_text(?![^"]*js-message_reply_text)[^"]*"[^>]*>([\s\S]*?)<\/div>/

/**
 * Tag que carrega a imagem da mensagem, em qualquer um dos três formatos:
 *
 *   foto   <a class="tgme_widget_message_photo_wrap ..." href=... style="width:..;background-image:url(..)">
 *   álbum  <a class="tgme_widget_message_photo_wrap grouped_media_wrap ..." style="left:..;width:..;background-image:url(..)" ...>
 *   vídeo  <i class="tgme_widget_message_video_thumb" style="background-image:url(..)">
 *
 * A regex antiga exigia a ordem exata da foto simples (`href` antes de
 * `style`, `width` logo no começo), e vídeo e álbum ficavam sem imagem.
 * A miniatura de citação (`reply_thumb`) fica de fora de propósito: é a foto
 * da mensagem respondida, não desta.
 */
const MEDIA_TAG_RE = /<[a-z]+\s[^>]*class="tgme_widget_message_(?:photo_wrap|video_thumb)\b[^"]*"[^>]*>/g

/**
 * Foto do PREVIEW do link, quando a mensagem não tem mídia própria:
 *
 *   <i class="link_preview_right_image" style="background-image:url(..)">  miniatura
 *   <i class="link_preview_image" style="background-image:url(..)">        preview grande
 *
 * Parte das ofertas (Mercado Livre, Kabum) é postada só com o link, e o
 * Telegram monta o card da loja com a foto do produto. Sem ler isso, essas
 * ofertas ficavam sem foto.
 */
const LINK_PREVIEW_IMAGE_RE = /<[a-z]+\s[^>]*class="link_preview_(?:right_)?image\b[^"]*"[^>]*>/g

function firstBackgroundImage(html: string, tagRe: RegExp): TelegramOfferImage | null {
  tagRe.lastIndex = 0
  for (const [tag] of html.matchAll(tagRe)) {
    const url = tag.match(/background-image:url\('([^']+)'\)/)?.[1]
    if (!url) continue
    const width = tag.match(/(?:^|[;"\s])width:(\d+)px/)?.[1]
    return { url, width: width ? Number(width) : null, height: null }
  }
  return null
}

/**
 * Foto da oferta: a mídia da própria mensagem (foto, capa do álbum, capa do
 * vídeo) e, só na falta dela, a foto do preview do link.
 */
function findMedia(html: string): TelegramOfferImage | null {
  return firstBackgroundImage(html, MEDIA_TAG_RE) ?? firstBackgroundImage(html, LINK_PREVIEW_IMAGE_RE)
}

type MessageContent = { text: string; image: TelegramOfferImage | null }

/**
 * Texto PRÓPRIO e mídia de uma mensagem. Serve tanto pro bloco da mensagem na
 * página do canal quanto pra página de embed de uma mensagem avulsa: as duas
 * usam as mesmas classes.
 */
function readMessageHtml(html: string): MessageContent {
  const textMatch = html.match(OWN_TEXT_RE)
  return { text: textMatch ? htmlToText(textMatch[1]) : "", image: findMedia(html) }
}

/**
 * O que vira card: link de LOJA e foto (própria, capa de vídeo/álbum ou a do
 * preview do link).
 *
 * Sem link é recado do canal ("Bom dia", enquete, aviso do site). Sem foto
 * nenhuma a oferta NÃO aparece, por decisão de produto: card sem foto fica
 * pela metade na grade. Na prática isso é resposta ("Quente" citando uma
 * oferta), aviso do site, linha estragada do cache, e o raro post de cupom
 * sem imagem nem preview (ex.: "Cupom Shopee R$ 15 OFF em R$ 75").
 */
function isOffer(message: MessageContent) {
  return hasOfferLink(message.text) && message.image !== null
}

type ParsedPage = {
  messages: ParsedMessage[]
  /** Mensagens vistas e descartadas (sem texto ou sem link). */
  rejectedIds: number[]
}

function parseChannelPage(html: string, username: string): ParsedPage {
  const startRe = /<div class="tgme_widget_message[^"]*"\s+data-post="([a-zA-Z0-9_]+)\/(\d+)"/g
  const starts: { index: number; username: string; messageId: number }[] = []

  let match: RegExpExecArray | null
  while ((match = startRe.exec(html))) {
    starts.push({ index: match.index, username: match[1], messageId: Number(match[2]) })
  }

  const messages: ParsedMessage[] = []
  const rejectedIds: number[] = []

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i]
    if (current.username !== username) continue

    const end = i + 1 < starts.length ? starts[i + 1].index : html.length
    const chunk = html.slice(current.index, end)

    const message = readMessageHtml(chunk)
    if (!isOffer(message)) {
      rejectedIds.push(current.messageId)
      continue
    }

    const dateMatch = chunk.match(/<time datetime="([^"]+)"/)
    messages.push({
      messageId: current.messageId,
      date: dateMatch ? dateMatch[1] : new Date().toISOString(),
      text: message.text,
      image: message.image,
    })
  }

  return { messages, rejectedIds }
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

/** Único host de onde o proxy aceita baixar: o CDN de mídia do Telegram. */
const TELEGRAM_CDN_HOST_RE = /(^|\.)(telesco\.pe|telegram\.org|cdn-telegram\.org)$/i

/**
 * Caminho do proxy de imagem de uma oferta. É o que o cliente recebe no lugar
 * da URL do CDN (ver `fetchOfferImageUrl`).
 */
export function offerImageProxyPath(messageId: number) {
  return `/api/offers/image/${messageId}`
}

/** Caminho do proxy da foto do canal, no rodapé de todo card. */
export const OFFER_AVATAR_PROXY_PATH = "/api/offers/avatar"

/**
 * A URL sai do HTML de terceiro e vira um fetch do NOSSO servidor: só https e
 * só o CDN do Telegram, pra rota de proxy não virar proxy aberto.
 */
function isTelegramCdnUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && TELEGRAM_CDN_HOST_RE.test(parsed.hostname)
  } catch {
    return false
  }
}

async function fetchTelegramHtml(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SunanoOffers/1.0)" },
    signal: AbortSignal.timeout(8000),
  })
  // Falha do Telegram é erro (a rota responde com cache curto); `null` nas
  // funções abaixo fica reservado pra "não tem imagem", que pode ir pro cache.
  if (!response.ok) throw new Error(`${url} indisponível (HTTP ${response.status})`)
  return response.text()
}

/**
 * Baixa uma imagem do CDN do Telegram pra repassar ao cliente. Lança quando o
 * CDN falha ou devolve algo que não é imagem.
 */
export async function fetchTelegramCdnImage(url: string) {
  if (!isTelegramCdnUrl(url)) throw new Error("URL fora do CDN do Telegram")
  const image = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const contentType = image.headers.get("content-type") ?? ""
  if (!image.ok || !image.body || !contentType.startsWith("image/")) {
    throw new Error(`CDN respondeu ${image.status} ${contentType}`)
  }
  return { body: image.body, contentType }
}

/**
 * URL atual da foto do canal, ou `null` se ele não tem foto.
 *
 * Mesmo problema da imagem da oferta: a URL gravada junto de cada oferta
 * (`authorAvatar`) expira em horas, e o rodapé dos cards antigos ficava com a
 * foto quebrada. A página do canal sempre traz a atual no `og:image`.
 */
export async function fetchChannelAvatarUrl(): Promise<string | null> {
  const username = getChannelUsername()
  if (!username) return null
  const { avatarUrl } = extractChannelMeta(await fetchTelegramHtml(`https://t.me/${username}`))
  return avatarUrl && isTelegramCdnUrl(avatarUrl) ? avatarUrl : null
}

/**
 * URL ATUAL da foto de uma mensagem do canal, ou `null` se ela não tem foto.
 *
 * A URL do CDN do Telegram (`cdn*.telesco.pe/file/...`) é assinada e expira em
 * poucas horas. A sincronização só renova as ~30 mensagens mais novas, então
 * tudo a partir da 3ª página da grade ficava com a URL gravada morta (404).
 * O embed de uma mensagem avulsa (`t.me/<canal>/<id>?embed=1`) sempre traz a
 * URL válida, mesmo pra mensagem antiga: é dele que o proxy lê.
 */
export async function fetchOfferImageUrl(messageId: number): Promise<string | null> {
  const username = getChannelUsername()
  if (!username) return null

  const html = await fetchTelegramHtml(`https://t.me/${username}/${messageId}?embed=1&mode=tme`)
  const url = findMedia(html)?.url
  return url && isTelegramCdnUrl(url) ? url : null
}

async function fetchTelegramOffers(limit = 30): Promise<ScrapeResult> {
  const username = getChannelUsername()
  if (!username) {
    throw new Error(
      "Canal público do Telegram não configurado. Defina TELEGRAM_OFFERS_PUBLIC_URL (ex: https://t.me/seucanal)."
    )
  }

  const collected: ParsedMessage[] = []
  const rejected: number[] = []
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

    const { messages: pageMessages, rejectedIds } = parseChannelPage(html, username)
    rejected.push(...rejectedIds)
    // A página seguinte começa na mensagem mais antiga VISTA, descartada ou
    // não: uma página só de recado não pode encerrar a paginação.
    const seen = [...pageMessages.map((m) => m.messageId), ...rejectedIds]
    if (seen.length === 0) break

    collected.push(...pageMessages)
    before = Math.min(...seen)
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
    rejectedIds: rejected.map((messageId) => `telegram-${messageId}`),
  }
}

/**
 * Só o scraping é memoizado. A gravação no banco fica de fora de propósito:
 * `unstable_cache` não permite escrita durante o render do valor cacheado, e
 * num cache hit não haveria nada novo pra gravar de qualquer forma.
 */
const getCachedTelegramScrape = unstable_cache(
  async (limit: number) => fetchTelegramOffers(limit),
  ["telegram-offers-v3"],
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
  let scraped: ScrapeResult | null = null
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
      await removeOffersFromCache(scraped.rejectedIds)
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

  // O histórico guarda linhas gravadas antes destas regras existirem; elas são
  // consertadas (ou saem) aqui, sem esperar os 5 dias de retenção.
  const offers = (await repairStoredOffers([...byId.values()]))
    .filter(isOffer)
    .sort((a, b) => b.messageId - a.messageId)
    .slice(0, HISTORY_LIMIT)

  const warning = scrapeError
    ? offers.length > 0
      ? "Não foi possível atualizar as ofertas agora; mostrando as últimas guardadas."
      : "Não foi possível carregar as ofertas agora. Tente novamente em alguns instantes."
    : offers.length === 0
      ? "Nenhuma mensagem encontrada no canal configurado. Verifique se o nome de usuário está correto."
      : null

  return { offers, source: "telegram", warning }
}

/**
 * Texto e mídia de uma mensagem avulsa, lidos da página de embed.
 *
 * Cache de um dia por mensagem: é o que deixa `repairStoredOffers` rodar a
 * cada request sem ir ao Telegram de novo. A URL de imagem guardada aqui
 * expira antes disso, mas não importa: ela só diz SE há foto, e quem entrega
 * a foto é o proxy, que busca a URL atual na hora.
 */
const getCachedEmbedMessage = unstable_cache(
  async (messageId: number): Promise<MessageContent | null> => {
    const username = getChannelUsername()
    if (!username) return null
    return readMessageHtml(await fetchTelegramHtml(`https://t.me/${username}/${messageId}?embed=1&mode=tme`))
  },
  ["telegram-offer-embed-v1"],
  { revalidate: 86400 }
)

/**
 * Linha que o leitor antigo gravou errado: sem imagem (vídeo e álbum não eram
 * reconhecidos) ou com o texto numa linha só (era a CITAÇÃO de uma resposta,
 * que o preview achata, e não o texto da mensagem).
 */
function needsRepair(offer: TelegramOffer) {
  return offer.image === null || !offer.text.includes("\n")
}

/** Quantas mensagens avulsas buscar ao mesmo tempo no Telegram. */
const REPAIR_CONCURRENCY = 8

/**
 * Relê no Telegram as linhas suspeitas do histórico e troca texto/imagem pelo
 * que a mensagem tem de verdade. A limpeza por `rejectedIds` só alcança as
 * ~30 mensagens mais novas; sem isto, o que foi gravado errado antes ficava
 * na grade (sem foto, com a citação achatada) até vencer a retenção.
 *
 * Mensagem que não dá pra confirmar (apagada, Telegram fora) sai com
 * `image: null` e é barrada por `isOffer`: sem foto confirmada, não há card.
 */
async function repairStoredOffers(offers: TelegramOffer[]): Promise<TelegramOffer[]> {
  const suspicious = offers.filter(needsRepair)
  if (suspicious.length === 0) return offers

  const repaired = new Map<string, TelegramOffer>()
  for (let i = 0; i < suspicious.length; i += REPAIR_CONCURRENCY) {
    const batch = suspicious.slice(i, i + REPAIR_CONCURRENCY)
    await Promise.all(
      batch.map(async (offer) => {
        let own: MessageContent | null = null
        try {
          own = await getCachedEmbedMessage(offer.messageId)
        } catch (error) {
          console.error(`[telegram-offers] embed da mensagem ${offer.messageId} falhou:`, error)
        }
        repaired.set(offer.id, { ...offer, text: own?.text ?? offer.text, image: own?.image ?? null })
      })
    )
  }

  return offers.map((offer) => repaired.get(offer.id) ?? offer)
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
    await removeOffersFromCache(result.rejectedIds)
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
