import "server-only"

import { getStoragePublicOrigin } from "@/lib/server/storage-origin"

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
