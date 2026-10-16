import { extractYoutubeVideoId, isValidYoutubeUrl } from "@/lib/youtube-url"

/**
 * Vídeo do anúncio da Loja (tutorial de serviço, demonstração do produto).
 * `store_products.video_url` guarda UM vídeo, que é um link do YouTube ou um
 * MP4 enviado pelo painel para o bucket abaixo (migration 20261227000000).
 *
 * O arquivo vai direto do navegador para o Storage por signed URL
 * (`/api/admin/store/upload-video`): a Vercel corta o corpo da requisição em
 * ~4.5MB, e um tutorial gravado de tela passa disso fácil.
 */
export const STORE_PRODUCT_VIDEO_BUCKET = "store-product-videos"

/**
 * Teto do arquivo, o mesmo `file_size_limit` do bucket. Fica fora de
 * `UPLOAD_LIMITS` porque o vídeo não passa pelo proxy (que trava aquela lista
 * no buffer de 24MB): quem barra o tamanho de verdade é o próprio Storage.
 */
export const STORE_PRODUCT_VIDEO_MAX_BYTES = 50 * 1024 * 1024

/** Nome que o upload gera: `product-video-<timestamp>-<uuid>.mp4`. */
const STORE_PRODUCT_VIDEO_NAME_RE =
  /^product-video-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i

export function newStoreProductVideoName(): string {
  return `product-video-${Date.now()}-${crypto.randomUUID()}.mp4`
}

export function isStoreProductVideoName(name: string): boolean {
  return STORE_PRODUCT_VIDEO_NAME_RE.test(name)
}

const UPLOADED_PATH_PREFIX = `/storage/v1/object/public/${STORE_PRODUCT_VIDEO_BUCKET}/`

/**
 * `true` se a URL tem o caminho de um vídeo enviado pelo painel. Só confere o
 * caminho: serve para a tela decidir COMO tocar. Quem decide se a URL pode ser
 * gravada é a rota, que prende também a origem (`isOwnStoreProductVideoUrl`).
 */
export function isUploadedStoreProductVideoUrl(url: string): boolean {
  try {
    const { protocol, pathname } = new URL(url)
    if (protocol !== "https:" && protocol !== "http:") return false
    if (!pathname.startsWith(UPLOADED_PATH_PREFIX)) return false
    return isStoreProductVideoName(pathname.slice(UPLOADED_PATH_PREFIX.length))
  } catch {
    return false
  }
}

export type StoreProductVideo = { kind: "youtube"; videoId: string } | { kind: "file"; src: string }

/** Como a página toca o vídeo salvo, ou `null` se não há vídeo reconhecível. */
export function resolveStoreProductVideo(url: string | null | undefined): StoreProductVideo | null {
  if (!url) return null
  if (isValidYoutubeUrl(url)) {
    const videoId = extractYoutubeVideoId(url)
    return videoId ? { kind: "youtube", videoId } : null
  }
  return isUploadedStoreProductVideoUrl(url) ? { kind: "file", src: url } : null
}
