import "server-only"

import type { StorageObjectRef } from "@/lib/server/storage-cleanup"
import { getStoragePublicOrigin, isOwnStorageObject } from "@/lib/server/storage-origin"

/** Bucket da mídia de perfil (`profile-media-upload.ts`). */
export const PROFILE_MEDIA_BUCKET = "peripherals"

/** Prefixo do arquivo por campo: `<prefixo>-<userId>-<timestamp>.<ext>`. */
export const PROFILE_MEDIA_PREFIX = {
  avatar: "user-avatar",
  banner: "user-banner",
  "mini-banner": "user-mini-banner",
} as const

/**
 * Foto do painel (`/api/admin/profile/upload-avatar`), no mesmo bucket. O
 * editor do perfil a recebe como foto enquanto o perfil não tem uma própria, e
 * a devolve no POST: por isso pode ser GRAVADA no perfil, mas nunca é apagada
 * pela limpeza do perfil (o arquivo é do `admin_profiles`).
 */
export const ADMIN_AVATAR_PREFIX = "admin-avatar"

/** `<timestamp>.<ext>`, o que sobra do nome depois de `<prefixo>-<userId>-`. */
const FILE_TAIL_RE = /^\d+\.[a-z0-9]{2,5}$/i

/**
 * `true` se `name` é exatamente `<prefixo>-<userId>-<timestamp>.<ext>`, sem
 * barra nem outro segmento. Prefixo sozinho não basta: o nome vai para a URL
 * das chamadas ao Storage, e só o formato exato garante que o objeto tocado é
 * o que o upload deste usuário gerou.
 */
export function isProfileMediaFileOf(name: string, prefix: string, userId: string): boolean {
  const head = `${prefix}-${userId}-`
  return name.startsWith(head) && FILE_TAIL_RE.test(name.slice(head.length))
}

/**
 * Objeto que o upload de mídia de perfil gerou para ESTE usuário, em qualquer
 * dos três campos (o mini banner pode reaproveitar o arquivo do banner). É o
 * que a troca de avatar/banner pode apagar: sem essa trava, a limpeza apagava
 * o arquivo de quem quer que a URL gravada apontasse.
 */
export function isOwnProfileMediaObject(object: StorageObjectRef, userId: string): boolean {
  if (object.bucket !== PROFILE_MEDIA_BUCKET) return false
  return Object.values(PROFILE_MEDIA_PREFIX).some((prefix) => isProfileMediaFileOf(object.path, prefix, userId))
}

/**
 * URL do nosso Storage que o usuário pode gravar no próprio perfil: o upload
 * dele, ou a foto do painel dele. A origem sozinha deixava gravar a URL de
 * qualquer arquivo do Storage.
 */
export function isOwnProfileMediaUrl(url: string, userId: string): boolean {
  return isOwnStorageObject(
    url,
    PROFILE_MEDIA_BUCKET,
    (name) =>
      isOwnProfileMediaObject({ bucket: PROFILE_MEDIA_BUCKET, path: name }, userId) ||
      isProfileMediaFileOf(name, ADMIN_AVATAR_PREFIX, userId)
  )
}

/** `true` se a URL aponta para o nosso Storage (qualquer bucket). */
export function isOurStorageUrl(url: string): boolean {
  const origin = getStoragePublicOrigin()
  if (!origin) return false
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

/**
 * Valida a URL de avatar/banner/mini-banner ANTES de gravá-la no perfil.
 *
 * Por quê: o usuário envia essas URLs como texto livre em `PATCH /api/profile`
 * (só `z.string().url()`, sem restrição de host). Depois `/api/profile-media/
 * [userId]/[field]` faz `fetch(url)` no servidor para congelar o primeiro
 * quadro de GIF de conta comum — ou seja, a URL vira alvo de uma requisição
 * server-side. Sem allowlist, isso é um SSRF autenticado: qualquer conta podia
 * gravar `https://169.254.169.254/...` ou `https://<host-interno>/...` e usar o
 * proxy de mídia para sondar a rede interna, além de mandar o navegador de
 * quem visse o perfil (redirect 302) para um host arbitrário.
 *
 * As únicas origens legítimas dessas URLs são:
 *   • o nosso Supabase Storage (uploads de avatar/banner) — casado por origin;
 *   • os hosts de avatar do login social (Google/Discord/GitHub) — os mesmos
 *     de `next.config.mjs > images.remotePatterns`.
 *
 * Caminho relativo (`/api/...`, gerado pela própria app) é sempre aceito.
 * Qualquer outra coisa é recusada.
 */

/** Hosts de avatar de OAuth — espelham `remotePatterns` do next.config.mjs. */
const ALLOWED_MEDIA_HOSTS = [
  "lh3.googleusercontent.com",
  "cdn.discordapp.com",
  "avatars.githubusercontent.com",
  "github.com",
  // Fallback de capa do blog/notícias (não é avatar, mas passa pelo mesmo campo em alguns fluxos).
  "images.unsplash.com",
]

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_MEDIA_HOSTS.some((allowed) => host === allowed)
}

/**
 * `true` se a URL pode ser gravada como mídia de perfil.
 *
 * `null`/`undefined` é válido (limpar o campo). String vazia idem.
 */
export function isAllowedProfileMediaUrl(url: string | null | undefined): boolean {
  if (url == null) return true
  const trimmed = url.trim()
  if (trimmed === "") return true

  // Caminho interno relativo gerado pela app (ex.: /api/profile-media/...).
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }

  // Só https — nunca http (mixed content / alvo de rede interna sem TLS),
  // nunca data:/blob:/file:/etc.
  if (parsed.protocol !== "https:") return false

  // Ignora fragmento (#animated) e query — só o host importa para a decisão.
  const storageOrigin = getStoragePublicOrigin()
  if (storageOrigin && parsed.origin === storageOrigin) return true

  return hostMatches(parsed.hostname)
}
