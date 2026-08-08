"use client"

import { FileText, MessageSquare, Users } from "lucide-react"

import {
  ACHIEVEMENT_TIER_BAR,
  ACHIEVEMENT_TIER_NAMES,
  ACHIEVEMENT_TIER_STYLES,
  ACHIEVEMENT_TRACK_LABELS,
  buildTrackProgress,
  formatAchievementCount,
  type AchievementTrack,
  type ShowcaseAchievement,
} from "@/lib/achievements"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const TRACK_ICONS: Record<AchievementTrack, React.ElementType> = {
  posts: FileText,
  comments: MessageSquare,
  followers: Users,
}

/**
 * Conquistas gerais (posts, comentários, seguidores) — diferente de
 * `MedalhasGrid` (medalhas manuais/de evento, tudo-ou-nada), aqui cada
 * trilha tem progressão contínua: mostra o nível atual e uma barra até o
 * próximo, mesmo quando nenhum nível foi destravado ainda.
 */
export function AchievementsGrid({
  achievements,
  counts,
  showTitle = true,
}: {
  achievements: ShowcaseAchievement[]
  counts: Record<AchievementTrack, number>
  /** `false` quando um título equivalente já é exibido pelo componente pai (ex: página /conquistas). */
  showTitle?: boolean
}) {
  const tracks = buildTrackProgress(counts, achievements)

  return (
    <section>
      {showTitle && (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Conquistas
        </h2>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tracks.map((progress) => {
          const Icon = TRACK_ICONS[progress.track]
          const tierStyle = progress.currentTier ? ACHIEVEMENT_TIER_STYLES[progress.currentTier] : null
          const tierName = progress.currentTier
            ? ACHIEVEMENT_TIER_NAMES[progress.track][progress.currentTier]
            : null
          // Barra progride na cor do próximo nível (o que está sendo buscado); nível máximo fica cheia na cor do próprio (diamante).
          const barColor = progress.nextTier
            ? ACHIEVEMENT_TIER_BAR[progress.nextTier]
            : progress.currentTier
              ? ACHIEVEMENT_TIER_BAR[progress.currentTier]
              : "bg-muted-foreground/40"
          const pct = progress.nextThreshold
            ? Math.min(100, Math.round((progress.count / progress.nextThreshold) * 100))
            : 100

          return (
            <Tooltip key={progress.track}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border bg-card/60 p-3",
                    progress.currentTier ? tierStyle : "border-border"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border",
                        tierStyle ?? "border-border bg-muted/30 text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="flex flex-col leading-none">
                      <span className="text-xs font-medium text-foreground">
                        {ACHIEVEMENT_TRACK_LABELS[progress.track]}
                      </span>
                      <span className="mt-1 text-[11px] text-muted-foreground">
                        {tierName ?? "Sem nível ainda"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                      <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {progress.nextThreshold
                        ? `${formatAchievementCount(progress.count)}/${formatAchievementCount(progress.nextThreshold)}`
                        : `${formatAchievementCount(progress.count)} — máx`}
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">
                  {formatAchievementCount(progress.count)} {ACHIEVEMENT_TRACK_LABELS[progress.track].toLowerCase()}
                </p>
                {progress.nextTier && progress.nextThreshold ? (
                  <p className="text-xs text-muted-foreground">
                    Faltam {formatAchievementCount(progress.nextThreshold - progress.count)} para{" "}
                    {ACHIEVEMENT_TIER_NAMES[progress.track][progress.nextTier]}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Nível máximo alcançado</p>
                )}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </section>
  )
}
