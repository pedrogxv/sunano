/**
 * Aura que uma avaliação de produto da Loja rende: +10, ou +20 com pelo menos
 * uma foto. Uma vez por produto. Decidido em 07/10/2026.
 *
 * Espelha `trg_reward_store_review_aura` (migration 20261219000000). O do
 * banco é o que vale: mudar um sem o outro faz a tela prometer uma Aura que a
 * avaliação não credita.
 */
export const STORE_REVIEW_AURA = 10
export const STORE_REVIEW_WITH_PHOTO_AURA = 20

/** Fotos por avaliação. Espelha o check `store_product_reviews_image_urls_max`. */
export const MAX_STORE_REVIEW_IMAGES = 3

export function storeReviewAuraFor(imageCount: number): number {
  return imageCount > 0 ? STORE_REVIEW_WITH_PHOTO_AURA : STORE_REVIEW_AURA
}
