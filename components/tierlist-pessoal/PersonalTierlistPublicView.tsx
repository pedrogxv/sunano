import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { groupByTierId, sortTiers, tierGradientStyle, tierTextColor } from "@/lib/personal-tierlist-theme"
import { PersonalTierlistCard } from "./PersonalTierlistCard"
import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

/**
 * Board read-only da tierlist pessoal, no mesmo idioma visual da tierlist
 * oficial (`components/tierlist/TierlistGrid.tsx`): coluna de tier com
 * gradiente + legenda, moldura única com glow radial, e cards que sobem e
 * abrem tooltip no hover (ver `PersonalTierlistCard`).
 *
 * `variant="preview"` é a versão espremida usada dentro do card do perfil:
 * mesma linguagem e mesmo hover, células menores e sem os nomes, para caber
 * num bloco curto sem virar uma segunda página.
 */
export function PersonalTierlistPublicView({
  tiers,
  items,
  variant = "full",
  maxPerTier,
}: {
  tiers: TierlistTierDef[]
  items: TierlistItem[]
  variant?: "full" | "preview"
  /** Corta cada linha em N itens e mostra "+N" no fim — só usado no preview. */
  maxPerTier?: number
}) {
  if (items.length === 0) {
    return (
      <div className={cn("rounded-xl border p-8 text-center", CARD_SURFACE)}>
        <p className="text-sm text-muted-foreground">Ainda não há itens nesta tierlist.</p>
      </div>
    )
  }

  const isPreview = variant === "preview"
  const orderedTiers = sortTiers(tiers)
  const byTier = groupByTierId(orderedTiers, items)
  const visibleTiers = orderedTiers.filter((tier) => (byTier.get(tier.id)?.length ?? 0) > 0)

  return (
    // `overflow-visible`: o hover cresce o card pra fora da linha — com overflow
    // escondido ele era cortado pela moldura, como acontecia antes.
    <div className={cn("relative overflow-visible rounded-xl border shadow-lg", CARD_SURFACE)}>
      {/* Mesmo glow radial da tierlist oficial — dá profundidade sem competir com os cards. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.07),_transparent_60%)]" />

      <div className="divide-y divide-border">
        {visibleTiers.map((tier, index) => {
          const rowItems = byTier.get(tier.id) ?? []
          const shown = maxPerTier ? rowItems.slice(0, maxPerTier) : rowItems
          const overflow = rowItems.length - shown.length
          const textColor = tierTextColor(tier.color)

          return (
            <div key={tier.id} className="flex items-stretch">
              {/* Coluna do tier: gradiente vertical + legenda, como no board oficial.
                  Os cantos arredondam nas pontas para acompanhar a moldura. */}
              <div
                style={tierGradientStyle(tier.color)}
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center px-1",
                  isPreview ? "w-12" : "w-16 sm:w-20",
                  index === 0 && "rounded-tl-xl",
                  index === visibleTiers.length - 1 && "rounded-bl-xl"
                )}
              >
                <span
                  className={cn(
                    "line-clamp-2 break-words text-center font-black leading-tight",
                    isPreview ? "text-sm" : "text-base"
                  )}
                  style={{ color: textColor }}
                >
                  {tier.label}
                </span>
              </div>

              <div className={cn("min-w-0 flex-1 bg-muted/20", isPreview ? "p-1.5" : "p-2")}>
                <div className={cn("flex flex-wrap", isPreview ? "gap-1.5" : "gap-2")}>
                  {shown.map((item) => (
                    <PersonalTierlistCard
                      key={item.peripheralId}
                      item={item}
                      tier={tier}
                      variant={variant}
                    />
                  ))}

                  {overflow > 0 && (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 text-[11px] font-semibold text-muted-foreground">
                      +{overflow}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
