"use client"

import { FileText, Flame, MessageSquare, Users } from "lucide-react"

import {
  ACHIEVEMENT_THRESHOLDS,
  ACHIEVEMENT_TIER_NAMES,
  ACHIEVEMENT_TIER_SOLID,
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
  aura_earned: Flame,
}

const RING_RADIUS = 26
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

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
      <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
        {tracks.map((progress) => {
          const Icon = TRACK_ICONS[progress.track]
          const tierStyle = progress.currentTier ? ACHIEVEMENT_TIER_STYLES[progress.currentTier] : null
          const tierName = progress.currentTier
            ? ACHIEVEMENT_TIER_NAMES[progress.track][progress.currentTier]
            : null
          const ringColor = progress.nextTier ? ACHIEVEMENT_TIER_SOLID[progress.nextTier] : null
          const floor = progress.currentTier ? ACHIEVEMENT_THRESHOLDS[progress.track][progress.currentTier] : 0
          const ringProgress =
            progress.nextTier && progress.nextThreshold
              ? Math.min(1, Math.max(0, (progress.count - floor) / (progress.nextThreshold - floor)))
              : 1

          return (
            <Tooltip key={progress.track}>
              <TooltipTrigger asChild>
                <div
                  style={
                    progress.currentTier
                      ? ({ "--glow-color": ACHIEVEMENT_TIER_SOLID[progress.currentTier] } as React.CSSProperties)
                      : undefined
                  }
                  className={cn(
                    "event-card-glow relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-transform hover:-translate-y-0.5",
                    tierStyle ?? "border-border bg-muted/30 text-muted-foreground"
                  )}
                >
                  {ringColor && (
                    <svg
                      className="pointer-events-none absolute inset-0 -rotate-90"
                      viewBox="0 0 56 56"
                      aria-hidden="true"
                    >
                      <circle
                        cx="28"
                        cy="28"
                        r={RING_RADIUS}
                        fill="none"
                        stroke={ringColor}
                        strokeOpacity="0.25"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r={RING_RADIUS}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringProgress)}
                        className="transition-[stroke-dashoffset] duration-500"
                      />
                    </svg>
                  )}
                  <Icon className="size-6" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="flex-col items-start gap-0.5">
                <p className="font-semibold">
                  {ACHIEVEMENT_TRACK_LABELS[progress.track]} — {tierName ?? "Sem nível ainda"}
                </p>
                <p className="text-xs text-muted-foreground">
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
