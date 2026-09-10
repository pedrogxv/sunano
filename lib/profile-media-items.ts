import { resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import type { ProfileLightboxItem } from "@/components/profile/ProfileImageLightbox"

/**
 * Monta a lista de mídias do perfil (capa e foto) que o visualizador exibe.
 *
 * Vive fora dos componentes porque `Banner` e `AvatarQuadrado` são renderizados
 * lado a lado por `ProfileShowcase` e precisam da **mesma** lista: quem abre a
 * capa troca para a foto por dentro do modal, sem voltar pro perfil. Cada um
 * passa só o índice que o próprio clique deve abrir (ver `indexOfMedia`).
 *
 * Entradas sem arquivo enviado não entram — o gradiente de fallback da capa e
 * as iniciais do avatar não têm o que ampliar.
 */
export type ProfileMediaKind = "banner" | "avatar"

export function buildProfileMediaItems({
  bannerUrl,
  avatarUrl,
  name,
  tier,
  vipExpiresAt,
}: {
  bannerUrl: string | null | undefined
  avatarUrl: string | null | undefined
  name: string
  tier: AccountTier
  vipExpiresAt: string | null
}): { items: ProfileLightboxItem[]; kinds: ProfileMediaKind[] } {
  const items: ProfileLightboxItem[] = []
  const kinds: ProfileMediaKind[] = []

  const banner = resolveProfileMedia(bannerUrl, tier, vipExpiresAt)
  if (banner.src) {
    items.push({
      src: banner.src,
      label: "Capa",
      alt: `Capa do perfil de ${name}`,
      unoptimized: banner.animated,
      freeze: banner.needsFreeze,
    })
    kinds.push("banner")
  }

  const avatar = resolveProfileMedia(avatarUrl, tier, vipExpiresAt)
  if (avatar.src) {
    items.push({
      src: avatar.src,
      label: "Foto",
      alt: `Foto de perfil de ${name}`,
      unoptimized: avatar.animated,
      freeze: avatar.needsFreeze,
    })
    kinds.push("avatar")
  }

  return { items, kinds }
}

/** Índice que o gatilho de cada mídia deve abrir — `-1` quando ela não existe. */
export function indexOfMedia(kinds: ProfileMediaKind[], kind: ProfileMediaKind) {
  return kinds.indexOf(kind)
}
