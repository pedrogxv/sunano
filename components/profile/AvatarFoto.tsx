import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import { cn } from "@/lib/utils"

interface AvatarFotoProps {
  avatarUrl: string | null
  name: string
  tier: AccountTier
  className?: string
}

/**
 * Foto de perfil circular, sobreposta à base do banner (metade dentro,
 * metade fora). O posicionamento vem do container em `ProfileShowcase`;
 * aqui fica só o círculo e o tratamento de mídia animada.
 */
export function AvatarFoto({ avatarUrl, name, tier, className }: AvatarFotoProps) {
  const { src, animated } = resolveProfileMedia(avatarUrl, tier)
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div
      className={cn(
        "relative size-24 overflow-hidden rounded-full border-4 border-background bg-muted shadow-xl sm:size-28 md:size-32",
        className
      )}
    >
      <ImageWithFallback
        src={src}
        alt={name}
        fill
        priority
        unoptimized={animated}
        sizes="128px"
        className="object-cover"
        fallback={
          <div className="flex size-full items-center justify-center bg-primary/15 text-2xl font-bold text-primary">
            {initials || "?"}
          </div>
        }
      />
    </div>
  )
}
