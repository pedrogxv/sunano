import "server-only"

import type { StorageObjectRef } from "@/lib/server/storage-cleanup"

/**
 * Foto de periférico enviada pelo painel (`/api/admin/peripherals/upload-image`).
 *
 * O bucket `peripherals` é compartilhado com mídia de perfil, avatar do painel,
 * capa de notícia, banner da home e logo de software; o que separa a foto de
 * periférico é o formato do nome. A limpeza da ficha só pode apagar esse
 * formato: `image_url` é texto livre no PATCH, e sem a trava quem edita
 * periférico apagava o arquivo de qualquer outra tela (ou de outro bucket).
 */
export const PERIPHERAL_IMAGE_BUCKET = "peripherals"

const PERIPHERAL_IMAGE_NAME_RE =
  /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i

/** Nome de um upload novo: `<timestamp>-<uuid>.<ext>`. */
export function newPeripheralImageName(extension: string): string {
  return `${Date.now()}-${crypto.randomUUID()}.${extension}`
}

/** `true` se o objeto é uma foto de periférico que o upload do painel gerou. */
export function isPeripheralImageObject(object: StorageObjectRef): boolean {
  return object.bucket === PERIPHERAL_IMAGE_BUCKET && PERIPHERAL_IMAGE_NAME_RE.test(object.path)
}
