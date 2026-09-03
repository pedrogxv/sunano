/**
 * Cliente da GIF API do KLIPY (https://klipy.com/developers).
 *
 * Substituto da Tenor API, desligada pelo Google em 30/06/2026.
 *
 * **Roda no browser, não no servidor.** Os requisitos de integração do KLIPY
 * (docs.klipy.com/integration-requirements) exigem que as chamadas partam do
 * cliente do usuário — "Do not route requests through partner-operated servers,
 * proxies, CDNs" — e proíbem cachear/rehospedar a resposta. Por isso não há
 * route handler no meio e a chave é `NEXT_PUBLIC_` (não é segredo: vai no PATH
 * da URL, é read-only e tem rate limit por chave — o modelo do KLIPY assume
 * exposição client-side, igual Tenor/GIPHY antes).
 *
 * Formato: `GET api.klipy.com/api/v1/{KEY}/gifs/{search,trending}`, paginação
 * `page` + `per_page`, resposta `{ result, data: { data: [...], has_next } }`.
 * Cada item traz `file[tamanho][formato] = { url, width, height }`, tamanhos
 * `hd|md|sm|xs`, formatos `gif|webp|jpg|mp4|webm`.
 */

const KLIPY_BASE = "https://api.klipy.com/api/v1"

/** `per_page` do KLIPY na busca: mínimo 8, máximo 50 (default deles é 24). */
export const GIF_PAGE_SIZE = 24

/**
 * Nível de filtro de conteúdo (MPA-style). Valores aceitos pelo KLIPY:
 * `off | low | medium | high`. `medium` barra nudez explícita/violência/uso
 * de substâncias sem cortar humor e reação — adequado pra comentários/posts.
 */
const CONTENT_FILTER = "medium"

/** Item já normalizado pro nosso front — só o necessário pra grade + anexo. */
export type KlipyGif = {
  id: string
  /** Slug do item — usado no `share` trigger (`gifs/share/{slug}`). */
  slug: string | null
  /** GIF em tamanho de exibição (o que é salvo no comentário/post). */
  url: string
  /** Versão leve pra miniatura da grade do seletor. */
  previewUrl: string
  width: number
  height: number
  /** Texto alternativo, quando o KLIPY manda. */
  title: string
}

export type KlipyGifPage = {
  gifs: KlipyGif[]
  /** Há mais páginas pra pedir (`data.has_next` do KLIPY). */
  hasMore: boolean
}

type KlipyFormat = {
  url?: string
  width?: number
  height?: number
}

/** Um tamanho (`hd`/`md`/...) → seus formatos (`gif`/`webp`/...). */
type KlipySize = Partial<Record<"gif" | "webp" | "jpg" | "mp4" | "webm", KlipyFormat>>

type KlipyItem = {
  id?: string | number
  slug?: string
  title?: string
  type?: string
  file?: Partial<Record<"hd" | "md" | "sm" | "xs", KlipySize>>
}

type KlipyResponse = {
  result?: boolean
  data?: {
    data?: KlipyItem[]
    has_next?: boolean
  }
  errors?: { message?: string[] }
}

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_KLIPY_API_KEY
  if (!key) {
    throw new Error("NEXT_PUBLIC_KLIPY_API_KEY não configurado.")
  }
  return key
}

/**
 * Primeiro `{ url, width, height }` que exista, varrendo os tamanhos em
 * `sizeOrder` e, dentro de cada um, os formatos em `formatOrder`. `gif` antes
 * de `webp` porque o `<img>`/`next-image` do site já lida com GIF em todo
 * lugar; `webp` animado nem sempre.
 */
function pickFormat(
  file: KlipyItem["file"],
  sizeOrder: ("hd" | "md" | "sm" | "xs")[],
  formatOrder: ("gif" | "webp" | "mp4")[] = ["gif", "webp"]
): KlipyFormat | null {
  if (!file) return null
  for (const size of sizeOrder) {
    const bucket = file[size]
    if (!bucket) continue
    for (const fmt of formatOrder) {
      const candidate = bucket[fmt]
      if (candidate?.url) return candidate
    }
  }
  return null
}

function normalizeItem(item: KlipyItem): KlipyGif | null {
  // Anexo: prioriza qualidade média (md) e cai pra sm/hd/xs.
  const main = pickFormat(item.file, ["md", "sm", "hd", "xs"])
  // Miniatura da grade: prioriza o menor (xs) e sobe se faltar.
  const preview = pickFormat(item.file, ["xs", "sm", "md", "hd"]) ?? main

  if (!main?.url) return null

  const slug = item.slug ?? null
  const id = String(item.id ?? slug ?? main.url)
  return {
    id,
    slug,
    url: main.url,
    previewUrl: preview?.url ?? main.url,
    width: main.width ?? preview?.width ?? 0,
    height: main.height ?? preview?.height ?? 0,
    title: item.title?.trim() || "GIF",
  }
}

async function fetchGifs(
  path: "search" | "trending",
  params: URLSearchParams,
  signal?: AbortSignal
): Promise<KlipyGifPage> {
  params.set("content_filter", CONTENT_FILTER)
  // Só GIF/WebP nos resultados — evita baixar/normalizar mp4/webm que não usamos.
  params.set("format_filter", "gif,webp")

  const url = `${KLIPY_BASE}/${getApiKey()}/gifs/${path}?${params.toString()}`

  // Sem cache do Next/nosso: os requisitos do KLIPY proíbem reter/rehospedar
  // a resposta. O CDN do KLIPY manda seus próprios headers de cache pro browser.
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal })

  if (!res.ok) {
    throw new Error(`KLIPY respondeu ${res.status}`)
  }

  const json = (await res.json()) as KlipyResponse
  if (json.result === false) {
    throw new Error(json.errors?.message?.[0] ?? "KLIPY recusou a requisição.")
  }

  const items = json.data?.data ?? []
  const gifs = items.map(normalizeItem).filter((g): g is KlipyGif => g !== null)

  return { gifs, hasMore: Boolean(json.data?.has_next) }
}

/** GIFs em alta — usado quando o campo de busca do seletor está vazio. */
export function trendingGifs(page = 1, signal?: AbortSignal): Promise<KlipyGifPage> {
  return fetchGifs(
    "trending",
    new URLSearchParams({ page: String(Math.max(1, page)), per_page: String(GIF_PAGE_SIZE) }),
    signal
  )
}

/** Busca por termo. `query` vazio cai em trending (o seletor chama assim). */
export function searchGifs(query: string, page = 1, signal?: AbortSignal): Promise<KlipyGifPage> {
  const trimmed = query.trim()
  if (!trimmed) return trendingGifs(page, signal)

  return fetchGifs(
    "search",
    new URLSearchParams({
      q: trimmed,
      page: String(Math.max(1, page)),
      per_page: String(GIF_PAGE_SIZE),
    }),
    signal
  )
}

/**
 * Id anônimo e estável deste navegador, pro `customer_id` do KLIPY (eles pedem
 * "a hash or UUID", "No personal data is collected"). Não usamos o id do
 * usuário logado — não há motivo pra mandar identificador de conta pro KLIPY.
 */
export function klipyCustomerId(): string | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const KEY = "klipy_cid"
    let cid = window.localStorage.getItem(KEY)
    if (!cid) {
      cid = crypto.randomUUID()
      window.localStorage.setItem(KEY, cid)
    }
    return cid
  } catch {
    return undefined
  }
}

/**
 * Avisa o KLIPY que um GIF foi efetivamente usado (`POST gifs/share/{slug}`).
 * Alimenta o trending/personalização deles e é esperado pelos requisitos de
 * integração. Best-effort: falha aqui não afeta o anexo do GIF.
 *
 * @param query termo que levou ao GIF (vazio quando veio do trending).
 */
export function triggerShare(slug: string, query: string): void {
  if (!slug) return
  try {
    const body = JSON.stringify({ customer_id: klipyCustomerId(), q: query.trim() || undefined })
    const url = `${KLIPY_BASE}/${getApiKey()}/gifs/share/${encodeURIComponent(slug)}`
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // sem chave / sem window — ignora
  }
}

/**
 * Hosts de mídia do KLIPY (ver docs.klipy.com/network-requirements). Só os
 * `static*` servem arquivo de imagem; `api.klipy.com`/`klipy.com` são API e
 * site, não entram aqui.
 */
const KLIPY_MEDIA_HOSTS = new Set([
  "static.klipy.com",
  "static1.klipy.com",
  "static2.klipy.com",
])

/** Extensões de imagem que o seletor pode anexar — corta `.mp4`/`.webm`. */
const KLIPY_IMAGE_EXT_RE = /\.(gif|webp|jpe?g|png)$/i

/**
 * A URL é um arquivo de imagem do CDN do KLIPY? GIFs escolhidos no seletor são
 * salvos junto das imagens do comentário/post; como não passam pelo nosso
 * upload, esta é a segunda barreira (além do schema zod) nas rotas de
 * comentário/post.
 *
 * Não basta checar o host: o CDN serve `mp4`/`webm` na mesma origem, e
 * `format_filter=gif,webp` só restringe o que a *busca* devolve, não o que o
 * cliente reenvia. Então exige `static*.klipy.com` **e** extensão de imagem.
 * Não valida que a URL veio de uma busca específica deste usuário — isso
 * exigiria estado por sessão; o pior caso aqui é hotlink do CDN do KLIPY, sem
 * custo nem risco de XSS pra gente (renderiza via `<img>`/`next/image`).
 */
export function isKlipyGifUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(rawUrl)
    if (protocol !== "https:") return false
    if (!KLIPY_MEDIA_HOSTS.has(hostname)) return false
    return KLIPY_IMAGE_EXT_RE.test(pathname)
  } catch {
    return false
  }
}
