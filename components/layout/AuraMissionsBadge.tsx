"use client"

import { useCallback, useEffect, useState } from "react"
import { RouteLink } from "@/components/ui/route-link"
import { ArrowRight, Bird, Check, MessageSquare, Sparkles, SquarePen, Youtube } from "lucide-react"
import { AURA_BRAND_FILL_CLASS, AuraAmount, AuraIcon } from "@/components/ui/AuraIcon"
import { toast } from "sonner"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthUser } from "@/components/providers/auth-context"
import { AURA_CHANGED_EVENT } from "@/lib/client/aura-events"
import {
  DISCORD_MEMBERSHIP_OAUTH,
  startScopedOAuth,
  YOUTUBE_SUBSCRIPTION_OAUTH,
} from "@/lib/client/start-scoped-oauth"
import {
  DAILY_MISSION_KEYS,
  DAILY_MISSION_REWARDS,
  EMPTY_DAILY_MISSIONS,
  auraLevelProgress,
  countCompletedMissions,
  formatAchievementCount,
  type DailyMissionKey,
  type DailyMissionsState,
  type UserStreak,
} from "@/lib/achievements"
import { cn } from "@/lib/utils"
import { isYoutubeSubscriptionEnabled } from "@/lib/youtube-subscription"
import { isDiscordMembershipEnabled } from "@/lib/discord-membership"
import { DiscordIcon } from "@/components/auth/provider-icons"

type AuraUsage = {
  balance: number
  totalEarned: number
  givenToday: number
  limit: number
  limitReached: boolean
  nextSlotAt: string | null
}

const MISSION_ICONS: Record<DailyMissionKey, React.ElementType> = {
  created_post: SquarePen,
  wrote_comment: MessageSquare,
  gave_aura: Sparkles,
}

/** Para onde cada missão manda o usuário — todas as ações (postar, comentar, dar aura) acontecem no fórum. */
const MISSION_HREFS: Record<DailyMissionKey, string> = {
  created_post: "/forum",
  wrote_comment: "/forum",
  gave_aura: "/forum",
}

const EMPTY_STREAK: UserStreak = {
  current: 0,
  longest: 0,
  shield: null,
  frozen: false,
  frozenUntil: null,
}

/**
 * Fallback lento: cobre missões cumpridas fora do evento de aura (criar
 * post/comentário). Toda ação de aura feita na própria aba já dispara
 * `AURA_CHANGED_EVENT`, que recarrega na hora — o polling só existe para
 * mudanças vindas de outro dispositivo/aba, que não têm urgência nenhuma.
 * A 60s isto era o maior gerador de invocações do projeto.
 */
const POLL_MS = 180_000

/**
 * Painel de Aura no rodapé da sidebar pública: saldo, nível da conta (trilha
 * "Aura farmada", ver `auraLevelProgress`) e missões do dia. É a entrada da
 * Central de Aura; o saldo saiu da TopBar para cá.
 *
 * O card inteiro é o link para `/aura`. Passar o mouse (desktop) abre ao lado
 * o popover com as 3 missões, a ofensiva e o limite diário de reações; no
 * toque o card só navega, e a Central mostra o mesmo conteúdo.
 */
export function AuraMissionsBadge({
  collapsed = false,
  active = false,
  onNavigate,
}: {
  /** Sidebar recolhida no desktop (md:w-16): só a chama e o saldo curto. */
  collapsed?: boolean
  /** Rota atual é a Central de Aura. */
  active?: boolean
  onNavigate?: () => void
}) {
  const { user } = useAuthUser()
  const [open, setOpen] = useState(false)
  const [missions, setMissions] = useState<DailyMissionsState | null>(null)
  const [streak, setStreak] = useState<UserStreak>(EMPTY_STREAK)
  const [usage, setUsage] = useState<AuraUsage | null>(null)
  const [youtubeConfirmed, setYoutubeConfirmed] = useState(true)
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  // Default `true` de propósito, igual ao do YouTube: enquanto o status não
  // chega (ou se a chamada falhar), o call-to-action fica escondido em vez de
  // piscar na cara de quem já resgatou.
  const [discordConfirmed, setDiscordConfirmed] = useState(true)
  const [discordLoading, setDiscordLoading] = useState(false)

  // Missões, ofensiva e saldo vêm juntos de /api/aura/badge — eram duas
  // chamadas separadas por tick, cada uma repetindo o auth.getUser().
  const loadBadge = useCallback(async () => {
    try {
      const res = await fetch("/api/aura/badge")
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      setMissions(data.missions ?? EMPTY_DAILY_MISSIONS)
      setStreak(data.streak ?? EMPTY_STREAK)
      setUsage(data.usage ?? null)
    } catch {
      setMissions(EMPTY_DAILY_MISSIONS)
      setUsage(null)
    }
  }, [])

  const loadYoutubeStatus = useCallback(async () => {
    if (!isYoutubeSubscriptionEnabled()) return
    try {
      const res = await fetch("/api/youtube/subscription-status")
      const data = res.ok ? await res.json() : null
      setYoutubeConfirmed(Boolean(data?.confirmed))
    } catch {
      setYoutubeConfirmed(true)
    }
  }, [])

  const loadDiscordStatus = useCallback(async () => {
    if (!isDiscordMembershipEnabled()) return
    try {
      const res = await fetch("/api/discord/membership-status")
      const data = res.ok ? await res.json() : null
      setDiscordConfirmed(Boolean(data?.confirmed))
    } catch {
      setDiscordConfirmed(true)
    }
  }, [])

  const loadAll = useCallback(() => {
    void loadBadge()
    void loadYoutubeStatus()
    void loadDiscordStatus()
  }, [loadBadge, loadYoutubeStatus, loadDiscordStatus])

  // O popover existe em todas as páginas, mas só /aura e /conquistas mostram o
  // `?youtube=`/`?discord=` que o callback devolve. Voltar para a página atual
  // (como era) terminava o fluxo sem aviso nenhum fora dessas duas.
  async function handleYoutubeConfirm() {
    setYoutubeLoading(true)
    const errorMessage = await startScopedOAuth(YOUTUBE_SUBSCRIPTION_OAUTH, "/aura")
    if (errorMessage) {
      toast.error(errorMessage)
      setYoutubeLoading(false)
    }
  }

  async function handleDiscordConfirm() {
    setDiscordLoading(true)
    const errorMessage = await startScopedOAuth(DISCORD_MEMBERSHIP_OAUTH, "/aura")
    if (errorMessage) {
      toast.error(errorMessage)
      setDiscordLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    loadAll()

    // Aba em segundo plano não recarrega: antes, uma aba esquecida aberta a
    // noite toda continuava chamando a API a cada minuto sem ninguém olhando.
    // Ao voltar ao primeiro plano recarrega na hora, então o dado que o
    // usuário vê nunca é o de antes de ele sair.
    let id: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (id === null) id = setInterval(loadAll, POLL_MS)
    }
    const stop = () => {
      if (id !== null) {
        clearInterval(id)
        id = null
      }
    }
    const handleVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        loadAll()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener(AURA_CHANGED_EVENT, loadAll)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener(AURA_CHANGED_EVENT, loadAll)
    }
  }, [user, loadAll])

  if (!user) return null

  if (!missions || !usage) {
    return <Skeleton className={cn("w-full rounded-xl", collapsed ? "h-14" : "h-[132px]")} />
  }

  const completed = countCompletedMissions(missions)
  const allDone = completed === DAILY_MISSION_KEYS.length
  const frozen = usage.limitReached
  const level = auraLevelProgress(usage.totalEarned)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <RouteLink
          href="/aura"
          onClick={() => {
            setOpen(false)
            onNavigate?.()
          }}
          aria-label={`Central de Aura: ${usage.balance} de Aura, nível ${level.level}, ${completed}/${DAILY_MISSION_KEYS.length} missões diárias`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            "relative block rounded-xl border transition-colors",
            active
              ? "border-orange-500/60 bg-orange-500/15"
              : "border-orange-500/25 bg-orange-500/[0.06] hover:border-orange-500/45 hover:bg-orange-500/10",
            collapsed ? "flex flex-col items-center gap-1 px-1 py-2" : "p-3"
          )}
        >
          {collapsed ? (
            <>
              <AuraIcon size="lg" />
              <span className="text-[10px] font-semibold leading-none tabular-nums text-foreground">
                {formatAchievementCount(usage.balance)}
              </span>
              {!allDone && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-orange-500" />
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Central de Aura
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              </div>

              <AuraAmount
                value={usage.balance}
                size="xl"
                tone="brand"
                className="mt-1 gap-1.5 font-display text-2xl font-bold leading-none text-foreground"
              />

              <div className="mt-3">
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate font-semibold text-foreground">
                    Nível {level.level}
                    {level.name && <span className="font-normal text-muted-foreground"> · {level.name}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {level.nextThreshold === null
                      ? "Máximo"
                      : `${formatAchievementCount(usage.totalEarned)}/${formatAchievementCount(level.nextThreshold)}`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-500", AURA_BRAND_FILL_CLASS)}
                    style={{ width: `${Math.round(level.ratio * 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>Missões de hoje</span>
                <span className={cn("font-semibold tabular-nums", allDone ? "text-emerald-400" : "text-foreground")}>
                  {completed}/{DAILY_MISSION_KEYS.length}
                </span>
              </div>
            </>
          )}
        </RouteLink>
      </PopoverAnchor>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={12}
        // Abre no hover: roubar o foco para dentro do popover tiraria a
        // pessoa do lugar onde ela está navegando.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-[min(20rem,calc(100vw-2rem))] bg-popover p-0 text-foreground shadow-md"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">Aura hoje</span>
          <span className={cn("text-xs font-semibold tabular-nums", frozen ? "text-sky-300" : "text-muted-foreground")}>
            {frozen ? "Limite atingido" : `${usage.givenToday}/${usage.limit}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">Missões diárias</span>
          <span className="text-[11px] text-muted-foreground">Reinicia à meia-noite (UTC)</span>
        </div>

        <ul className="flex flex-col gap-1.5 p-3">
          {DAILY_MISSION_KEYS.map(({ key, label }) => {
            const done = missions[key]
            const Icon = MISSION_ICONS[key]
            const itemClassName = cn(
              "flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm",
              done ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-border text-muted-foreground"
            )
            return (
              <li key={key}>
                {done ? (
                  <div className={itemClassName}>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-400/20">
                      <Check className="size-3" />
                    </span>
                    <span>{label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">+{DAILY_MISSION_REWARDS[key]} aura</span>
                  </div>
                ) : (
                  <RouteLink
                    href={MISSION_HREFS[key]}
                    className={cn(itemClassName, "group transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground")}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border">
                      <Icon className="size-3" />
                    </span>
                    <span className="text-foreground">{label}</span>
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                      +{DAILY_MISSION_REWARDS[key]} aura
                      <ArrowRight className="size-3 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </RouteLink>
                )}
              </li>
            )
          })}
        </ul>

        {isYoutubeSubscriptionEnabled() && !youtubeConfirmed && (
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={handleYoutubeConfirm}
              disabled={youtubeLoading}
              className="flex w-full items-center gap-2.5 rounded-lg border border-red-600/30 bg-red-600/5 px-2.5 py-1.5 text-sm text-foreground transition-colors hover:border-red-600/50 hover:bg-red-600/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-red-600/50 bg-red-600/10 text-red-500">
                <Youtube className="size-3" />
              </span>
              <span>{youtubeLoading ? "Conectando…" : "Inscreva-se no YouTube"}</span>
              <span className="ml-auto text-[11px] font-semibold text-red-500">+50 aura</span>
            </button>
          </div>
        )}

        {isDiscordMembershipEnabled() && !discordConfirmed && (
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={handleDiscordConfirm}
              disabled={discordLoading}
              className="flex w-full items-center gap-2.5 rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/5 px-2.5 py-1.5 text-sm text-foreground transition-colors hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[#5865F2]/50 bg-[#5865F2]/10 text-[#5865F2]">
                <DiscordIcon className="size-3" fill="currentColor" />
              </span>
              <span>{discordLoading ? "Conectando…" : "Conecte seu Discord"}</span>
              <span className="ml-auto text-[11px] font-semibold text-[#5865F2]">+50 aura</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <Bird
            className={cn("size-4 shrink-0", streak.current > 0 ? "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]" : "text-muted-foreground")}
          />
          <p className="text-xs text-muted-foreground">
            {streak.current > 0 ? (
              <>
                <span className="font-semibold text-amber-400">{streak.current} dia{streak.current === 1 ? "" : "s"}</span> de ofensiva
                {allDone ? ", mantida hoje!" : ". Complete as 3 hoje para não perder."}
              </>
            ) : allDone ? (
              "Ofensiva iniciada. Volte amanhã para continuar."
            ) : (
              "Complete as 3 missões hoje para começar uma ofensiva."
            )}
          </p>
        </div>

        <RouteLink
          href="/aura"
          className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
        >
          Ver Central de Aura
          <ArrowRight className="size-3" />
        </RouteLink>
      </PopoverContent>
    </Popover>
  )
}
