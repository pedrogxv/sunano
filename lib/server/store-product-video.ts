import "server-only"

import type { StorageObjectRef } from "@/lib/server/storage-cleanup"
import { isOwnStorageObject } from "@/lib/server/storage-origin"
import { STORE_PRODUCT_VIDEO_BUCKET, isStoreProductVideoName } from "@/lib/store-product-video"
import { isValidYoutubeUrl } from "@/lib/youtube-url"

/** URL de vídeo enviado pelo painel, presa à origem do NOSSO Storage. */
export function isOwnStoreProductVideoUrl(url: string): boolean {
  return isOwnStorageObject(url, STORE_PRODUCT_VIDEO_BUCKET, isStoreProductVideoName)
}

/** O que `store_products.video_url` aceita: link do YouTube ou upload nosso. */
export function isAcceptedStoreProductVideoUrl(url: string): boolean {
  return isValidYoutubeUrl(url) || isOwnStoreProductVideoUrl(url)
}

export const STORE_PRODUCT_VIDEO_URL_ERROR = "O vídeo precisa ser um link do YouTube ou um arquivo enviado pelo painel."

/** Predicado da limpeza: só o vídeo que o upload do anúncio gerou sai do bucket. */
export function isStoreProductVideoObject(object: StorageObjectRef): boolean {
  return object.bucket === STORE_PRODUCT_VIDEO_BUCKET && isStoreProductVideoName(object.path)
}
