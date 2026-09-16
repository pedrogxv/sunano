import { Sparkles } from "lucide-react"

import {
  ProfileAvatar,
  AVATAR_SIZES,
  avatarBadgeGeometry,
  type ProfileAvatarSize,
} from "@/components/ui/ProfileAvatar"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import { profileFrameOf, type ProfileFrameIdentity } from "@/lib/profile-frames"
import type { PublicProfileSummary } from "@/lib/user-directory"

/**
 * Avatar de um perfil do diretório de pessoas.
 *
 * Só desenha o que é específico DESTE contexto: a faísca da tag especial
 * (`lib/special-tag.ts`), que depende do slug e não é moldura. Círculo,
 * borda, moldura e coroa VIP vêm todos de `ProfileAvatar` — o
 * componente único de foto de usuário do site.
 */
export function PersonAvatar({
  profile,
  size = "md",
  className,
  frame,
}: {
  profile: Pick<PublicProfileSummary, "display_name" | "avatar_url" | "account_tier" | "vip_expires_at"> & {
    /** Pode ser `null` fora do diretório de pessoas (ex: byline de notícia). */
    display_slug: string | null
    /** Moldura equipada + VIP + Fundador, quando a consulta os traz. */
    equipped_avatar_frame_slug?: string | null
    equipped_avatar_frame_url?: string | null
    is_founder?: boolean | null
  }
  size?: ProfileAvatarSize
  className?: string
  /**
   * Moldura pronta. Só para quando o chamador já a tem montada; por padrão
   * ela sai do próprio `profile`, que é o que evita a tela esquecer de passar.
   */
  frame?: ProfileFrameIdentity
}) {
  const specialTag = getSpecialTag(profile.display_slug)

  return (
    // `isolate` pelo mesmo motivo de `ProfileAvatar`: a faísca abaixo é
    // `absolute z-20`, e num `relative` sem `z-index` ela empilharia contra a
    // página inteira — passando por cima da topbar e dos menus.
    <div className={cn("relative isolate shrink-0", AVATAR_SIZES[size].box, className)}>
      <ProfileAvatar
        name={profile.display_name}
        avatarUrl={profile.avatar_url}
        size={size}
        frame={frame ?? profileFrameOf(profile)}
      />
      {specialTag && <SpecialTagBadge label={specialTag.label} size={size} />}
    </div>
  )
}

/**
 * A faísca da tag especial. Mora no canto SUPERIOR direito de propósito: o
 * emblema da moldura já ocupa o centro da base, e empilhar os dois lá
 * esconderia um atrás do outro. O tamanho sai de `avatarBadgeGeometry` — o
 * mesmo do emblema de moldura — para não voltar a ser um selo de chrome fixo
 * ocupando meia foto nos avatares pequenos.
 */
function SpecialTagBadge({ label, size }: { label: string; size: ProfileAvatarSize }) {
  const { icon, pillStyle } = avatarBadgeGeometry(size, true)
  return (
    <span
      title={label}
      aria-label={label}
      className="pointer-events-none absolute top-0 right-0 z-20 flex items-center justify-center rounded-full border-background bg-cyan-400 -translate-y-1/4 translate-x-1/4"
      style={pillStyle ?? undefined}
    >
      <Sparkles className="text-cyan-950" width={icon} height={icon} style={{ width: icon, height: icon }} />
    </span>
  )
}
