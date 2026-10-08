import "server-only"

import { isOwnStorageObject } from "@/lib/server/storage-origin"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

/**
 * Fotos de avaliação de produto da Loja, bucket público `store-reviews`
 * (migration 20261219000000), gravado só por `/api/store/reviews/upload-image`.
 */
export const STORE_REVIEW_BUCKET = "store-reviews"
export const MAX_STORE_REVIEW_IMAGE_BYTES = UPLOAD_LIMITS.support
export const ALLOWED_STORE_REVIEW_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

/** `<timestamp>.<ext>`, o que sobra do nome depois de `store-review-<uid>-`. */
const FILE_TAIL_RE = /^\d+\.(?:jpe?g|png|webp)$/i

export function storeReviewImageFileName(userId: string, extension: string): string {
  return `store-review-${userId}-${Date.now()}.${extension}`
}

/**
 * A URL veio de um upload DESTE usuário em `/api/store/reviews/upload-image`.
 * Nome exato (`store-review-<uid>-<timestamp>.<ext>`), host da nossa origem e
 * caminho ancorado no bucket: sem isso a avaliação aceitaria a foto de outra
 * pessoa, ou um link externo que nunca passou pela validação de tamanho/MIME.
 */
export function isOwnedStoreReviewImageUrl(url: string, userId: string): boolean {
  const prefix = `store-review-${userId}-`
  return isOwnStorageObject(
    url,
    STORE_REVIEW_BUCKET,
    (name) => name.startsWith(prefix) && FILE_TAIL_RE.test(name.slice(prefix.length))
  )
}
