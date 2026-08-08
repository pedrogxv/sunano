import "server-only"

/**
 * Limites de anexo de imagem em comentário — únicos para fórum e blog.
 *
 * Bem mais restritivo que o upload de post do fórum (5MB/imagem): comentário
 * é um recurso de altíssimo volume comparado a post, então o custo de
 * storage/egress do bucket dedicado `comments` escala muito mais rápido.
 * O bucket já trava 1MB/MIME no Supabase (ver migration
 * 20260825_comment_images_and_mentions.sql) — este valor é a segunda barreira,
 * igual ao restante do projeto (nunca confiar só na config do bucket).
 */
export const MAX_COMMENT_IMAGES = 2
export const MAX_COMMENT_IMAGE_BYTES = 1024 * 1024
export const ALLOWED_COMMENT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

export const MAX_COMMENT_MENTIONS = 2

/**
 * Confere que cada URL enviada pelo cliente veio mesmo de um upload feito
 * por este usuário em `/api/comments/upload-image` — sem isso, o body do
 * POST de comentário aceitaria qualquer URL (ex.: link de imagem gigante
 * hospedada fora, inflando o post sem nunca passar pela validação de
 * tamanho/MIME, ou a URL do upload de outra pessoa).
 */
export function isOwnedCommentImageUrl(url: string, userId: string): boolean {
  try {
    const { pathname } = new URL(url)
    const marker = `/comments/comment-${userId}-`
    return pathname.includes(marker)
  } catch {
    return false
  }
}
