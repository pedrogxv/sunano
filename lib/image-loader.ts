import { supabaseResizedImage } from "@/lib/storage-image"

/**
 * Loader do `next/image` (configurado em next.config.mjs).
 *
 * Substitui o otimizador da Vercel em todo o app: em vez de `/_next/image`,
 * cada imagem do nosso bucket é redimensionada pelo próprio Supabase Storage.
 * O motivo está em `lib/storage-image.ts` — a cota de transformações da
 * Vercel estourou e o endpoint passou a responder 402, quebrando toda imagem
 * ainda não cacheada.
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
