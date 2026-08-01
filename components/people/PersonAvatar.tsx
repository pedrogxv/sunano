import { Crown } from "lucide-react"

import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { resolveProfileMedia } from "@/lib/account-tier"
import { cn } from "@/lib/utils"
import type { PublicProfileSummary } from "@/lib/user-directory"

const SIZE_CLASSES = {
  xs: "size-5 text-[8px]",
  sm: "size-8 text-[10px]",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
} as const

const CROWN_SIZE = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
} as const

/** Avatar circular com iniciais de fallback e coroa para contas VIP. */
export function PersonAvatar({
  profile,
  size = "md",
  className,
}: {
  profile: Pick<PublicProfileSummary, "display_name" | "avatar_url" | "account_tier">
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  const { src, animated } = resolveProfileMedia(profile.avatar_url, profile.account_tier)
  const initials =
    profile.display_name.trim().split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "?"
  const isVip = profile.account_tier !== "common"

  return (
    <div className={cn("relative shrink-0", SIZE_CLASSES[size], className)}>
      <div className="relative size-full overflow-hidden rounded-full border border-border bg-primary/15">
        <ImageWithFallback
          src={src}
          alt={profile.display_name}
          fill
          unoptimized={animated}
          sizes="56px"
          className="object-cover"
          fallback={
            <div className="flex size-full items-center justify-center font-bold text-primary">
              {initials}
            </div>
          }
        />
      </div>
      {isVip && (
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-background bg-amber-400 p-[3px]">
          <Crown className={cn(CROWN_SIZE[size], "text-amber-950")} />
        </span>
      )}
    </div>
  )
}
