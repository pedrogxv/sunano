import "server-only"

import { isKlipyGifUrl } from "@/lib/klipy"
import { isOwnStorageObject } from "@/lib/server/storage-origin"

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
export const ALLOWED_COMMENT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export const MAX_COMMENT_MENTIONS = 2

/**
 * Confere que cada URL enviada pelo cliente veio mesmo de um upload feito
 * por este usuário em `/api/comments/upload-image` — sem isso, o body do
 * POST de comentário aceitaria qualquer URL (ex.: link de imagem gigante
 * hospedada fora, inflando o post sem nunca passar pela validação de
 * tamanho/MIME, ou a URL do upload de outra pessoa). Amarra host + bucket +
 * prefixo `comment-<uid>-` (o mesmo que a RLS de storage.objects já exige).
 */
export function isOwnedCommentImageUrl(url: string, userId: string): boolean {
  return isOwnStorageObject(url, "comments", (name) => name.startsWith(`comment-${userId}-`))
}

/**
 * URL aceitável no array `image_urls` de um comentário: ou é um upload que
 * este usuário fez em `/api/comments/upload-image`, ou é um GIF do CDN do
 * KLIPY escolhido pelo seletor (ver `lib/klipy.ts`). Qualquer outro link
 * `https` de imagem é recusado — o mesmo motivo de `isOwnedCommentImageUrl`
 * existir: sem isso o campo aceitaria qualquer URL externa, fugindo da
 * validação de tamanho/MIME do upload.
 */
export function isAllowedCommentImageUrl(url: string, userId: string): boolean {
  return isOwnedCommentImageUrl(url, userId) || isKlipyGifUrl(url)
}
