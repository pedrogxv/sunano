import { profileMediaWithWidth, storageThumbUrl } from "@/lib/storage-thumb"

/**
 * Histórico: já tentamos o otimizador da Vercel (`/_next/image`, estourou
 * cota e passou a responder 402) e depois o endpoint `render/image` do
 * Supabase Storage (Image Transformation, desativado — passou a responder
 * 400 "querystring/resize must be string" pra qualquer imagem). Nenhum dos
 * dois transformadores está disponível agora. O redimensionamento passou a
 * ser feito NO UPLOAD: cada imagem ganha miniaturas por largura no próprio
 * bucket, e este loader aponta para a menor que cobre o `width` pedido — ver
 * `lib/storage-thumb.ts`.
 *
 * Se `render/image` voltar a ser usado no futuro, imagens antigas com essa
 * URL cacheada em algum lugar (ex.: `og:image` salvo) precisam ser migradas
 * de volta pro segmento `object/public`.
 */

/** Trecho que identifica um objeto público do Supabase Storage. */
const RENDER_IMAGE_SEGMENT = "/storage/v1/render/image/public/"
const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/"

/**
 * URL da miniatura que cobre `width` (ver `lib/storage-thumb.ts`); o original
 * quando nenhuma serve. URL externa (Google/Discord/YouTube/Unsplash) e
 * arquivo de /public voltam intactos. O proxy de mídia de perfil recebe
 * `?w=` e redireciona sozinho para a miniatura.
 */
export function supabaseResizedImage(
  url: string,
  options: { width: number; quality?: number }
): string {
  if (url.includes(RENDER_IMAGE_SEGMENT)) {
    const [path] = url.split("?")
    return storageThumbUrl(path.replace(RENDER_IMAGE_SEGMENT, PUBLIC_OBJECT_SEGMENT), options.width)
  }
  if (url.startsWith("/api/profile-media/")) return profileMediaWithWidth(url, options.width)
  return storageThumbUrl(url, options.width)
}
