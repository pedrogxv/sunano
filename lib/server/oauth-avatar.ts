import "server-only"

import { isAnimatedMediaUrl } from "@/lib/account-tier"

/**
 * Avatar de login social e o gate de mídia animada.
 *
 * O upload de perfil recusa GIF de conta comum em três pontos (ver
 * `lib/server/profile-media-upload.ts`), mas o avatar do OAuth **não passa
 * por lá**: o `auth/callback` copia `user_metadata.avatar_url` do provedor
 * direto para o perfil. Era o buraco por onde conta comum acabava com foto
 * animada — dois usuários chegaram assim, ambos pelo Google.
 *
 * Detectar não é sintático em todos os casos:
 *
 *  - Discord codifica na URL (`/avatars/{id}/a_{hash}.png`), então
 *    `isAnimatedMediaUrl` resolve sozinho, sem rede.
 *  - Google (`lh3.googleusercontent.com/a/…=s96-c`) não tem extensão nem
 *    marca alguma; o único sinal é o `Content-Type` da resposta. Por isso
 *    este módulo é assíncrono e vive no servidor.
 *
 * O resultado é gravado como sufixo `#animated` na URL — um fragmento é
 * ignorado por servidor e por `next/image`, então a imagem continua
 * carregando igual, e `isAnimatedMediaUrl` passa a reconhecê-la em todas as
 * 12 telas que já chamam `resolveProfileMedia`. Assim a checagem de rede
 * acontece uma vez no login, não a cada renderização.
 */

/** Teto de espera do HEAD — o login não pode travar por causa do avatar. */
const PROBE_TIMEOUT_MS = 5_000

/** Hosts cujo avatar pode ser animado sem que a URL revele isso. */
const OPAQUE_AVATAR_HOSTS = ["googleusercontent.com"]

function isOpaqueAvatarHost(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return OPAQUE_AVATAR_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Marca a URL com `#animated` se o avatar do provedor for animado.
 *
 * Nunca lança e nunca bloqueia o login: qualquer falha de rede devolve a URL
 * como veio. O custo de errar para menos é um avatar animado a mais até o
 * próximo passe do script de auditoria — errar para mais congelaria a foto
 * de alguém sem motivo.
 */
export async function markAnimatedOAuthAvatar(url: string | null): Promise<string | null> {
  if (!url) return null

  // Discord e `.gif` explícito já são detectáveis pela própria URL — não
  // gasta um round-trip, e o `#animated` seria redundante.
  if (isAnimatedMediaUrl(url)) return url
  if (!isOpaqueAvatarHost(url)) return url

  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) return url

    const contentType = res.headers.get("content-type")?.toLowerCase() ?? ""
    if (!contentType.includes("image/gif")) return url

    return `${url}#animated`
  } catch {
    // Timeout/DNS/etc. — segue com a URL original.
    return url
  }
}
