import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import type { AccountTier } from "@/lib/account-tier"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { DEFAULT_ADJUST, type MediaAdjust } from "@/lib/profile-media-adjust"
import { buildProfileMediaItems, indexOfMedia } from "@/lib/profile-media-items"
import { ProfileImageLightbox } from "./ProfileImageLightbox"

interface AvatarQuadradoProps {
  avatarUrl: string | null
  name: string
  /** Moldura da pessoa em um objeto só (`profileFrameOf`) — forma preferida. */
  frame?: ProfileFrameIdentity
  tier?: AccountTier
  /** Quando expira o VIP (`null` = sem expiração) — decide o selo de coroa. */
  vipExpiresAt?: string | null
  /** Enquadramento escolhido pelo dono no editor de perfil. */
  adjust?: MediaAdjust
  className?: string
  /** Moldura cosmética equipada (Central de Aura), sobreposta à foto — `null`/ausente = nenhuma. */
  frameUrl?: string | null
  /** Slug da moldura equipada — identifica as de arte em código, que não têm asset. */
  frameSlug?: string | null
  /** Se possui a Moldura de Fundador (permanente, independe de VIP ativo). */
  isFounder?: boolean
  /**
   * Capa do perfil, só para o visualizador poder oferecer a aba "Capa" ao lado
   * da foto. Não é renderizada aqui (quem desenha a capa é `Banner`).
   */
  bannerUrl?: string | null
}

/**
 * Foto grande do perfil público — o MESMO `ProfileAvatar` do resto do site,
 * com `shape="rounded"` e o lightbox por cima.
 *
 * Este arquivo não desenha moldura, anel, brilho nem selo: tudo isso vem do
 * componente central. Ele já tentou desenhar o próprio anel com
 * `border-image`, que **ignora `border-radius` por especificação** — o
 * gradiente saía como um retângulo de canto vivo sobre a foto arredondada,
 * exatamente o desencontro de borda que aparecia no perfil. Qualquer ajuste
 * de moldura vai em `lib/profile-frames.ts` / `ProfileAvatar`, nunca aqui.
 *
 * `avatarUrl` já chega como `profileMediaProxyUrl` (nunca a coluna crua) —
 * quem resolve tier/VIP e decide se o GIF anima ou congela é a rota, com
 * dado fresco do banco (ver `resolveProfileMedia`/`profileMediaProxyUrl` em
 * `lib/account-tier.ts` e `profile-showcase-repository.ts`).
 */
export function AvatarQuadrado({
  avatarUrl,
  name,
  frame,
  tier,
  vipExpiresAt = null,
  adjust = DEFAULT_ADJUST,
  className,
  frameUrl,
  frameSlug,
  isFounder = false,
  bannerUrl = null,
}: AvatarQuadradoProps) {
  const avatarEl = (
    <ProfileAvatar
      name={name}
      avatarUrl={avatarUrl}
      size="2xl"
      shape="rounded"
      frame={frame}
      tier={tier}
      vipExpiresAt={vipExpiresAt}
      adjust={adjust}
      frameUrl={frameUrl}
      frameSlug={frameSlug}
      isFounder={isFounder}
      priority
      // Só aqui a pastilha do selo mostra o texto ("VIP"): é a única foto
      // grande o bastante para caber sem cobrir o rosto.
      showBadgeText
      className={className}
    />
  )

  // Sem foto enviada, o fallback de iniciais não tem o que ampliar.
  if (!avatarUrl) return avatarEl

  const { items, kinds } = buildProfileMediaItems({
    bannerUrl,
    avatarUrl,
    name,
  })

  return (
    <ProfileImageLightbox
      items={items}
      index={indexOfMedia(kinds, "avatar")}
      // A foto é pequena; a lupa no canto cobriria boa parte dela, então
      // aqui ela vem centralizada sobre o rosto.
      hintPosition="center"
    >
      {avatarEl}
    </ProfileImageLightbox>
  )
}
