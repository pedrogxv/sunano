import "server-only"

import { isKlipyGifUrl } from "@/lib/klipy"
import { isOwnStorageObject } from "@/lib/server/storage-origin"

/**
 * Validação de origem das URLs em `media_image_urls` de um post do fórum.
 *
 * Antes do seletor de GIF, o route de criação de post só exigia `z.string().url()`
 * — qualquer link `https` passava. Isso permitia embutir no feed uma imagem
 * gigante hospedada fora, ou um "pixel" de tracking (`.../p.gif?u=<vitima>`)
 * que vaza IP/User-Agent de quem abre o post. Aqui a segunda barreira: a URL
 * ou é um upload que passou por `/api/forum/posts/upload-media` (bucket
 * `peripherals`, nome `forum-post-<uid>-*` — ver
 * 20260809_forum_media_storage_rls.sql), ou é um GIF do CDN do KLIPY escolhido
 * pelo seletor (ver `lib/klipy.ts`).
 */

/** Nome de arquivo de mídia de post: `forum-post-<uid>-<timestamp>.<ext>`. */
const FORUM_MEDIA_NAME_RE = /^forum-post-[0-9a-f-]+-/i

/** Upload de mídia de post feito por *este* usuário (host + bucket + prefixo). */
export function isOwnedForumMediaUrl(url: string, userId: string): boolean {
  return isOwnStorageObject(url, "peripherals", (name) => name.startsWith(`forum-post-${userId}-`))
}

/** Upload de mídia de post feito por *qualquer* usuário (para edição por admin). */
export function isForumMediaUrl(url: string): boolean {
  return isOwnStorageObject(url, "peripherals", (name) => FORUM_MEDIA_NAME_RE.test(name))
}

/** Criação de post: upload do próprio autor ou GIF do KLIPY. */
export function isAllowedForumImageUrl(url: string, userId: string): boolean {
  return isOwnedForumMediaUrl(url, userId) || isKlipyGifUrl(url)
}

/**
 * Edição por admin: o autor original pode ser outra pessoa, então basta que a
 * URL tenha origem confiável (qualquer upload de mídia de post ou GIF do KLIPY).
 */
export function isAllowedForumImageUrlForModeration(url: string): boolean {
  return isForumMediaUrl(url) || isKlipyGifUrl(url)
}
