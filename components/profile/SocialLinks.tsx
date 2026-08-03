import { Youtube } from "lucide-react"

import { TikTokIcon } from "@/components/icons/social-icons"
import { cn } from "@/lib/utils"

interface SocialLinksProps {
  youtubeHandle: string | null
  tiktokHandle: string | null
  /** Deixa quem chama decidir alinhamento e espaçamento. */
  className?: string
}

const LINK_CLASS =
  "flex size-8 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"

/** Ícones clicáveis para YouTube/TikTok — só aparece quando o dono informou o handle. */
export function SocialLinks({ youtubeHandle, tiktokHandle, className }: SocialLinksProps) {
  if (!youtubeHandle && !tiktokHandle) return null

  return (
    <div className={cn("mt-2 flex items-center gap-2", className)}>
      {youtubeHandle && (
        <a
          href={`https://youtube.com/@${youtubeHandle}`}
          target="_blank"
          rel="noreferrer"
          aria-label="YouTube"
          className={LINK_CLASS}
        >
          <Youtube className="size-4" />
        </a>
      )}
      {tiktokHandle && (
        <a
          href={`https://tiktok.com/@${tiktokHandle}`}
          target="_blank"
          rel="noreferrer"
          aria-label="TikTok"
          className={LINK_CLASS}
        >
          <TikTokIcon className="size-4" />
        </a>
      )}
    </div>
  )
}
