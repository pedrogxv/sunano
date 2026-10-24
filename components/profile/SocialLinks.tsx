import { Instagram, Youtube } from "lucide-react"

import { SteamIcon, TikTokIcon } from "@/components/icons/social-icons"
import {
  PROFILE_SOCIALS,
  type ProfileSocialColumn,
  type ProfileSocialHandles,
} from "@/lib/profile-socials"
import { cn } from "@/lib/utils"

const SOCIAL_ICONS: Record<ProfileSocialColumn, React.ElementType<{ className?: string }>> = {
  youtube_handle: Youtube,
  tiktok_handle: TikTokIcon,
  instagram_handle: Instagram,
  steam_handle: SteamIcon,
}

/** Ícone da rede — o mesmo no editor, no preview e na vitrine. */
export function SocialNetworkIcon({
  column,
  className,
}: {
  column: ProfileSocialColumn
  className?: string
}) {
  const Icon = SOCIAL_ICONS[column]
  return <Icon className={className} />
}

interface SocialLinksProps {
  handles: Partial<ProfileSocialHandles>
  /** Deixa quem chama decidir alinhamento e espaçamento. */
  className?: string
}

const LINK_CLASS =
  "flex size-8 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"

/** Ícones clicáveis das redes — só aparece a rede que o dono informou. */
export function SocialLinks({ handles, className }: SocialLinksProps) {
  const linked = PROFILE_SOCIALS.flatMap((social) => {
    const handle = handles[social.column]
    return handle ? [{ social, handle }] : []
  })
  if (linked.length === 0) return null

  return (
    <div className={cn("mt-2 flex items-center gap-2", className)}>
      {linked.map(({ social, handle }) => (
        <a
          key={social.column}
          href={social.url(handle)}
          target="_blank"
          rel="noreferrer"
          aria-label={social.label}
          title={social.label}
          className={LINK_CLASS}
        >
          <SocialNetworkIcon column={social.column} className="size-4" />
        </a>
      ))}
    </div>
  )
}
