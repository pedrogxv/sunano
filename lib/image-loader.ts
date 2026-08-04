import { supabaseResizedImage } from "@/lib/storage-image"

/**
 * Loader do `next/image` (configurado em next.config.mjs).
 *
 * Substitui o otimizador da Vercel em todo o app: nenhum `<Image>` passa por
 * `/_next/image` nem por transformador nenhum — ver histórico e motivo em
 * `lib/storage-image.ts`. Isso faz o `width`/`quality` do `next/image` serem
 * ignorados; o navegador sempre recebe o arquivo original.
 *
 * Fazer isso pelo loader, e não caso a caso, garante que qualquer `<Image>`
 * novo já nasça no caminho certo.
 *
 * Roda no servidor e no cliente: precisa ser puro e não importar nada que
 * dependa de ambiente. URLs que não são do bucket (foto de login social,
 * thumbnail do YouTube, arquivo de /public) voltam intactas.
 */
export default function supabaseImageLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}): string {
  return supabaseResizedImage(src, { width, quality })
}
