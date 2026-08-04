/**
 * Histórico: já tentamos o otimizador da Vercel (`/_next/image`, estourou
 * cota e passou a responder 402) e depois o endpoint `render/image` do
 * Supabase Storage (Image Transformation, desativado — passou a responder
 * 400 "querystring/resize must be string" pra qualquer imagem). Nenhum dos
 * dois transformadores está disponível agora, então servimos o arquivo
 * original do bucket sem redimensionar.
 *
 * Se `render/image` voltar a ser usado no futuro, imagens antigas com essa
 * URL cacheada em algum lugar (ex.: `og:image` salvo) precisam ser migradas
 * de volta pro segmento `object/public`.
 */

/** Trecho que identifica um objeto público do Supabase Storage. */
const RENDER_IMAGE_SEGMENT = "/storage/v1/render/image/public/"
const PUBLIC_OBJECT_SEGMENT = "/storage/v1/object/public/"

/**
 * URL do objeto original no Storage, sem passar por nenhum transformador.
 * `width`/`quality` são ignorados — mantidos na assinatura só porque o
 * loader do `next/image` sempre os passa.
 */
export function supabaseResizedImage(
  url: string,
  _options: { width: number; quality?: number }
): string {
  if (url.includes(RENDER_IMAGE_SEGMENT)) {
    const [path] = url.split("?")
    return path.replace(RENDER_IMAGE_SEGMENT, PUBLIC_OBJECT_SEGMENT)
  }
  // Objeto já no formato final (bucket sem transformação) ou URL externa
  // (Google/Discord/YouTube/Unsplash) — devolve intacta, query incluída.
  return url
}
