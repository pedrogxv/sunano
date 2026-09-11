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
 *
 * `bannerUrl`/`avatarUrl` já chegam como `profileMediaProxyUrl` (nunca a
 * coluna crua) — quem decide se o GIF anima ou congela é a própria rota, com
 * o tier lido fresco do banco, então esta lista não precisa saber de tier/VIP.
 */
export type ProfileMediaKind = "banner" | "avatar"

export function buildProfileMediaItems({
  bannerUrl,
  avatarUrl,
  name,
}: {
  bannerUrl: string | null | undefined
  avatarUrl: string | null | undefined
  name: string
}): { items: ProfileLightboxItem[]; kinds: ProfileMediaKind[] } {
  const items: ProfileLightboxItem[] = []
  const kinds: ProfileMediaKind[] = []

  if (bannerUrl) {
    items.push({
      src: bannerUrl,
      label: "Capa",
      alt: `Capa do perfil de ${name}`,
    })
    kinds.push("banner")
  }

  if (avatarUrl) {
    items.push({
      src: avatarUrl,
      label: "Foto",
      alt: `Foto de perfil de ${name}`,
    })
    kinds.push("avatar")
  }

  return { items, kinds }
}

/** Índice que o gatilho de cada mídia deve abrir — `-1` quando ela não existe. */
export function indexOfMedia(kinds: ProfileMediaKind[], kind: ProfileMediaKind) {
  return kinds.indexOf(kind)
}
