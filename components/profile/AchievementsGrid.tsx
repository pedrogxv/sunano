"use client"

import { FileText, Flame, MessageSquare, Users, Youtube } from "lucide-react"

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
import { DiscordIcon } from "@/components/auth/provider-icons"
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

/** Cor vermelha "estilo YouTube" do badge especial "Inscrito" — fora da paleta por tier (não é bronze/prata/ouro/etc). */
const YOUTUBE_RED = "#FF0000"
const DISCORD_BLURPLE = "#5865F2"

/**
 * Conquistas gerais (posts, comentários, seguidores) — diferente de
 * `MedalhasGrid` (medalhas manuais/de evento, tudo-ou-nada), aqui cada
 * trilha tem progressão contínua: mostra o nível atual e uma barra até o
 * próximo, mesmo quando nenhum nível foi destravado ainda.
 *
 * Os badges "Inscrito" (`youtubeSubscribed`) e "No Discord"
 * (`discordMember`) são slots fixos nessa mesma fileira — visualmente iguais
 * às trilhas (mesmo tamanho de círculo, mesmo glow), mas sem anel de
 * progresso porque são binários (tem ou não tem), não trilhas de tiers com
 * contador. `undefined` omite o slot inteiro (ex.: contexto sem esse dado
 * disponível, ou a conquista desligada por env).
 */
export function AchievementsGrid({
  achievements,
  counts,
  showTitle = true,
  youtubeSubscribed,
  discordMember,
}: {
  achievements: ShowcaseAchievement[]
  counts: Record<AchievementTrack, number>
  /** `false` quando um título equivalente já é exibido pelo componente pai (ex: página /conquistas). */
  showTitle?: boolean
  /** Se confirmou inscrição no YouTube — `undefined` omite o badge. */
  youtubeSubscribed?: boolean
  /** Se confirmou participação no servidor do Discord — `undefined` omite o badge. */
  discordMember?: boolean
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
        {youtubeSubscribed !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                style={youtubeSubscribed ? ({ "--glow-color": YOUTUBE_RED } as React.CSSProperties) : undefined}
                className={cn(
                  "relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-transform hover:-translate-y-0.5",
                  youtubeSubscribed
                    ? "event-card-glow border-red-600 bg-red-600/10 text-red-500"
                    : "border-border bg-muted/30 text-muted-foreground opacity-50"
                )}
              >
                <Youtube className="size-6" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">Inscrito</p>
              <p className="text-xs text-background/70">
                {youtubeSubscribed
                  ? "Confirmou a inscrição no canal do Sunano no YouTube."
                  : "Confirme sua inscrição no canal para desbloquear."}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {discordMember !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                style={discordMember ? ({ "--glow-color": DISCORD_BLURPLE } as React.CSSProperties) : undefined}
                className={cn(
                  "relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-transform hover:-translate-y-0.5",
                  discordMember
                    ? "event-card-glow border-[#5865F2] bg-[#5865F2]/10 text-[#5865F2]"
                    : "border-border bg-muted/30 text-muted-foreground opacity-50"
                )}
              >
                <DiscordIcon className="size-6" fill="currentColor" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">No Discord</p>
              <p className="text-xs text-background/70">
                {discordMember
                  ? "Conectou o Discord e faz parte do servidor do Sunano."
                  : "Conecte seu Discord e confirme que está no servidor para desbloquear."}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
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
              <TooltipContent>
                <p className="font-semibold">
                  {ACHIEVEMENT_TRACK_LABELS[progress.track]} — {tierName ?? "Sem nível ainda"}
                </p>
                <p className="text-xs text-background/70">
                  {formatAchievementCount(progress.count)} {ACHIEVEMENT_TRACK_LABELS[progress.track].toLowerCase()}
                </p>
                {progress.nextTier && progress.nextThreshold ? (
                  <p className="text-xs text-background/70">
                    Faltam {formatAchievementCount(progress.nextThreshold - progress.count)} para{" "}
                    {ACHIEVEMENT_TIER_NAMES[progress.track][progress.nextTier]}
                  </p>
                ) : (
                  <p className="text-xs text-background/70">Nível máximo alcançado</p>
                )}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </section>
  )
}
