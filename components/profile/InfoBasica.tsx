import { Crown, Sparkles } from "lucide-react"

import { getTierCapabilities, type AccountTier } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"

interface InfoBasicaProps {
  name: string
  bio: string | null
  tier: AccountTier
  memberSince?: string | null
  /** Slug do perfil — resolve tag especial (ex: SUNANO), se houver. */
  displaySlug?: string | null
}

const TIER_BADGE_STYLES: Record<AccountTier, string> = {
  common: "border-border bg-muted/40 text-muted-foreground",
  vip: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  vip_plus: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
}

/** Nome, badge de tier + tag especial (aglutinados) e bio curta — bloco centralizado sob a foto. */
export function InfoBasica({ name, bio, tier, memberSince, displaySlug }: InfoBasicaProps) {
  const { label } = getTierCapabilities(tier)
  const isVip = tier !== "common"
  const isVipPlus = tier === "vip_plus"
  const specialTag = getSpecialTag(displaySlug)

  const joinedLabel = memberSince
    ? new Date(memberSince).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : null

  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{name}</h1>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
            TIER_BADGE_STYLES[tier]
          )}
        >
          {isVip && <Crown className={cn("size-3", isVipPlus && "vip-plus-badge-crown")} />}
          <span className={cn(isVipPlus && "vip-plus-badge-text")}>{label}</span>
        </span>

        {specialTag && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
              specialTag.className
            )}
          >
            <Sparkles className="size-3" />
            {specialTag.label}
          </span>
        )}
      </div>

      {bio && <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{bio}</p>}

      {joinedLabel && (
        <p className="text-xs text-muted-foreground/60">Membro desde {joinedLabel}</p>
      )}
    </div>
  )
}
