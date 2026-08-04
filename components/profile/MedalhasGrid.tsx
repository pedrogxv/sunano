import Image from "next/image"
import { Award, Lock } from "lucide-react"

import { countHiddenByTier, getMedalLimit, type AccountTier } from "@/lib/account-tier"
import { MEDAL_RARITY_SOLID, MEDAL_RARITY_STYLES, type ShowcaseMedal } from "@/lib/profile-showcase"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface MedalhasGridProps {
  /** Já filtradas pelo limite do tier (ver `selectVisibleMedals`). */
  medals: ShowcaseMedal[]
  total: number
  tier: AccountTier
  isOwner?: boolean
}

/**
 * Grid de medalhas. A quantidade exibida é decidida no domínio
 * (`selectVisibleMedals`); aqui só renderizamos e mostramos os slots
 * vazios restantes do tier, além do excedente como "+N".
 */
export function MedalhasGrid({ medals, total, tier, isOwner = false }: MedalhasGridProps) {
  const limit = getMedalLimit(tier)
  const hidden = countHiddenByTier(total, limit)
  const emptySlots = Math.max(0, limit - medals.length)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Medalhas
        </h2>
        <span className="text-xs text-muted-foreground/60">
          {medals.length} de {limit} slots · {total} conquistada{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
        {medals.map((medal) => (
          <Tooltip key={medal.id}>
            <TooltipTrigger asChild>
              <div
                style={{ "--glow-color": MEDAL_RARITY_SOLID[medal.rarity] } as React.CSSProperties}
                className={cn(
                  "event-card-glow relative flex size-16 shrink-0 items-center justify-center rounded-xl border transition-transform hover:-translate-y-0.5",
                  MEDAL_RARITY_STYLES[medal.rarity]
                )}
              >
                {medal.icon_url ? (
                  <Image
                    src={medal.icon_url}
                    alt={medal.name}
                    width={40}
                    height={40}
                    className="size-10 object-contain"
                  />
                ) : (
                  <Award className="size-7" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{medal.name}</p>
              {medal.description && (
                <p className="text-xs text-muted-foreground">{medal.description}</p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}

        {Array.from({ length: emptySlots }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/60"
          >
            <Award className="size-6 text-muted-foreground/20" />
          </div>
        ))}

        {hidden > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-muted/20 text-muted-foreground">
                <Lock className="size-4" />
                <span className="text-xs font-semibold">+{hidden}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isOwner
                ? `Você tem ${hidden} medalha${hidden === 1 ? "" : "s"} além do limite do seu plano. Escolha quais destacar nas configurações.`
                : `${hidden} medalha${hidden === 1 ? "" : "s"} não exibida${hidden === 1 ? "" : "s"}.`}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {medals.length === 0 && total === 0 && (
        <p className="text-sm text-muted-foreground/60">
          {isOwner ? "Você ainda não conquistou medalhas." : "Nenhuma medalha conquistada ainda."}
        </p>
      )}
    </section>
  )
}
