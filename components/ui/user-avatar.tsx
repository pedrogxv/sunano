import { ProfileAvatar, type ProfileAvatarSize } from "@/components/ui/ProfileAvatar"
import { profileFrameOf, type ProfileFrameIdentity } from "@/lib/profile-frames"

/**
 * Compatibilidade: `UserAvatar` recebia o tamanho como número de unidades do
 * Tailwind (`size={8}` → `size-8`) e desenhava o próprio círculo. Hoje é uma
 * casca fina sobre `ProfileAvatar`, que é o componente único de foto de
 * usuário do site (ver `components/ui/ProfileAvatar.tsx` e `AGENTS.md`).
 *
 * **Em código novo, use `ProfileAvatar` direto.** Este arquivo existe só para
 * as telas de admin que já passavam um número; ele traduz para o token de
 * tamanho mais próximo.
 */
const SIZE_BY_UNITS: Array<[number, ProfileAvatarSize]> = [
  [6, "xs"],
  [9, "sm"],
  [12, "md"],
  [16, "lg"],
  [22, "xl"],
]

function sizeToken(units: number): ProfileAvatarSize {
  for (const [max, token] of SIZE_BY_UNITS) {
    if (units <= max) return token
  }
  return "2xl"
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 8,
  /** Conta que existiu e foi removida — desenho padrão (fundo vermelho + ícone). */
  removed = false,
  tier,
  vipExpiresAt = null,
  frame,
  frameUrl,
  frameSlug,
  isFounder,
  longestStreak,
  frameOptOut,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
  removed?: boolean
  tier?: string | null
  vipExpiresAt?: string | null
  /** Moldura da pessoa em um objeto só (`profileFrameOf`) — forma preferida. */
  frame?: ProfileFrameIdentity
  frameUrl?: string | null
  /** Slug do item equipado — identifica moldura de arte em código (sem asset). */
  frameSlug?: string | null
  /** Se é Fundador. Permanente: não se deriva de `tier`. */
  isFounder?: boolean | null
  /** Recorde de ofensiva — decide a moldura de marco. Nunca a ofensiva atual. */
  longestStreak?: number | null
  /** O dono escolheu não exibir moldura nenhuma. */
  frameOptOut?: boolean | null
}) {
  return (
    <ProfileAvatar
      name={name}
      avatarUrl={avatarUrl}
      size={sizeToken(size)}
      removed={removed}
      frame={
        frame ??
        profileFrameOf({
          equippedFrameSlug: frameSlug,
          equippedFrameUrl: frameUrl,
          accountTier: tier,
          vipExpiresAt,
          isFounder,
          longestStreak,
          frameOptOut,
        })
      }
    />
  )
}
