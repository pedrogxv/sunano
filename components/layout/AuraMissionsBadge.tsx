"use client"

import { useCallback, useEffect, useState } from "react"
import { RouteLink } from "@/components/ui/route-link"
import { ArrowRight, Bird, Check, Clock, MessageSquare, Sparkles, SquarePen, Youtube } from "lucide-react"
import { AURA_BRAND_FILL_CLASS, AuraAmount, AuraIcon } from "@/components/ui/AuraIcon"
import { AuraFlame } from "@/components/ui/AuraFlame"
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

/** "3h 12min" até a próxima meia-noite UTC, quando as missões zeram. */
function formatTimeUntilUtcMidnight(now = new Date()): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  const minutes = Math.max(0, Math.ceil((next - now.getTime()) / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

/** Anel de progresso das missões do dia, com a contagem no centro. */
function MissionRing({ completed, total, done }: { completed: number; total: number; done: boolean }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" className="size-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - completed / total)}
          className={cn("transition-[stroke-dashoffset] duration-700", done ? "stroke-emerald-400" : "stroke-orange-500")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <Check className="size-5 text-emerald-400" strokeWidth={3} />
        ) : (
          <span className="text-sm font-bold tabular-nums">
            {completed}
            <span className="text-muted-foreground">/{total}</span>
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * Painel de Aura no rodapé da sidebar pública: saldo e missões do dia (o
 * nível da conta fica só na Central, no card "Aura atual"). É a entrada da
 * Central de Aura; o saldo saiu da TopBar para cá.
 *
 * O card inteiro é o link para `/aura`. Passar o mouse (desktop) abre ao lado
 * o popover com as 3 missões, a ofensiva e o limite diário de reações; no
 * toque o card só navega, e a Central mostra o mesmo conteúdo.
 */
export function AuraMissionsBadge({
  collapsed = false,
  active = false,
  attached = false,
  onNavigate,
}: {
  /** Sidebar recolhida no desktop (md:w-16): só a chama e o saldo curto. */
  collapsed?: boolean
  /** Rota atual é a Central de Aura. */
  active?: boolean
  /** Encaixado embaixo da aba VIP (`SidebarVipTab`): sem borda nem cantos em cima. */
  attached?: boolean
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
    return <Skeleton className={cn("w-full rounded-xl", attached && "rounded-t-none", collapsed ? "h-14" : "h-[132px]")} />
  }

  const completed = countCompletedMissions(missions)
  const allDone = completed === DAILY_MISSION_KEYS.length
  const frozen = usage.limitReached

  // Só mouse de verdade abre o painel. No toque o navegador emula um
  // `mouseenter` antes do clique, e o painel abria ao lado da gaveta do
  // celular, cortado pela borda da tela, em vez de o card só navegar.
  const openOnHover = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(true)
  }
  const closeOnHover = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <RouteLink
          href="/aura"
          onClick={() => {
            setOpen(false)
            onNavigate?.()
          }}
          aria-label={`Central de Aura: ${usage.balance} de Aura, ${completed}/${DAILY_MISSION_KEYS.length} missões diárias`}
          onPointerEnter={openOnHover}
          onPointerLeave={closeOnHover}
          className={cn(
            "group relative block rounded-xl border transition-colors",
            attached && "rounded-t-none border-t-0",
            active
              ? "border-orange-500/60 bg-orange-500/15"
              : "border-orange-500/25 bg-orange-500/[0.06] hover:border-orange-500/45 hover:bg-orange-500/10",
            collapsed ? "flex flex-col items-center gap-1 px-1 py-2" : "p-3"
          )}
        >
          {collapsed ? (
            <>
              <AuraFlame size="lg" />
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

              {/* O saldo é o herói do card: chama VIVA (não o `AuraIcon`
                  chapado), com fagulhas, e o hover no card atiça o fogo. O
                  número queima junto (`.aura-title-text`, a brasa correndo do
                  título da Central). O nível mora na Central, não aqui. */}
              <span className="mt-1.5 flex items-end gap-2 font-display text-2xl font-bold leading-none tabular-nums">
                <AuraFlame size="lg" sparks className="size-7" />
                <span className="aura-title-text">{usage.balance.toLocaleString("pt-BR")}</span>
              </span>

              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>Missões diárias</span>
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
        sideOffset={24}
        collisionPadding={16}
        // Abre no hover: roubar o foco para dentro do popover tiraria a
        // pessoa do lugar onde ela está navegando.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={openOnHover}
        onPointerLeave={closeOnHover}
        className="w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-orange-500/20 bg-popover p-0 text-foreground shadow-xl shadow-black/40"
      >
        {/* Cabeçalho: anel de progresso das missões + contagem regressiva */}
        <div className="relative overflow-hidden px-5 pb-5 pt-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-orange-500/20 blur-3xl"
          />
          <div className="relative flex items-center gap-3.5">
            <MissionRing completed={completed} total={DAILY_MISSION_KEYS.length} done={allDone} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold leading-tight">
                {allDone ? "Missões completas" : "Missões diárias"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3 shrink-0" />
                Reinicia em {formatTimeUntilUtcMidnight()}
              </p>
            </div>
          </div>

          <div className="relative mt-5 rounded-xl border border-border/60 bg-background/40 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <AuraIcon size="xs" tone={frozen ? "muted" : "brand"} />
                Aura distribuída hoje
              </span>
              <span className={cn("font-semibold tabular-nums", frozen ? "text-sky-300" : "text-foreground")}>
                {frozen ? "Limite atingido" : `${usage.givenToday}/${usage.limit}`}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", frozen ? "bg-sky-400" : AURA_BRAND_FILL_CLASS)}
                style={{ width: `${Math.min(100, Math.round((usage.givenToday / Math.max(1, usage.limit)) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        <ul className="flex flex-col gap-2.5 px-5 pb-5">
          {DAILY_MISSION_KEYS.map(({ key, label }) => {
            const done = missions[key]
            const Icon = MISSION_ICONS[key]
            const reward = (
              <AuraAmount
                value={DAILY_MISSION_REWARDS[key]}
                prefix="+"
                size="xs"
                tone={done ? "muted" : "brand"}
                className={cn(
                  "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  done ? "bg-muted/60 text-muted-foreground" : "bg-orange-500/10 text-orange-300"
                )}
              />
            )
            return (
              <li key={key}>
                {done ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2.5 text-sm">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    <span className="text-muted-foreground line-through decoration-emerald-400/50">{label}</span>
                    {reward}
                  </div>
                ) : (
                  <RouteLink
                    href={MISSION_HREFS[key]}
                    className="group flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm transition-all hover:-translate-y-px hover:border-orange-500/40 hover:bg-orange-500/[0.06]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground transition-colors group-hover:bg-orange-500/15 group-hover:text-orange-300">
                      <Icon className="size-4" />
                    </span>
                    <span className="font-medium text-foreground">{label}</span>
                    {reward}
                  </RouteLink>
                )}
              </li>
            )
          })}
        </ul>

        {((isYoutubeSubscriptionEnabled() && !youtubeConfirmed) || (isDiscordMembershipEnabled() && !discordConfirmed)) && (
          <div className="border-t border-border/60 px-5 pb-5 pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bônus de uma vez</p>
            <div className="grid grid-cols-2 gap-2.5">
              {isYoutubeSubscriptionEnabled() && !youtubeConfirmed && (
                <button
                  type="button"
                  onClick={handleYoutubeConfirm}
                  disabled={youtubeLoading}
                  className="flex flex-col items-start gap-2 rounded-xl border border-red-600/25 bg-gradient-to-br from-red-600/15 to-transparent p-3 text-left transition-all hover:-translate-y-px hover:border-red-600/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-red-600/20 text-red-500">
                    <Youtube className="size-4" />
                  </span>
                  <span className="text-xs font-semibold leading-tight">
                    {youtubeLoading ? "Conectando…" : "Inscreva-se no YouTube"}
                  </span>
                  <AuraAmount value={50} prefix="+" size="xs" tone="inherit" className="text-[11px] font-bold text-red-400" />
                </button>
              )}
              {isDiscordMembershipEnabled() && !discordConfirmed && (
                <button
                  type="button"
                  onClick={handleDiscordConfirm}
                  disabled={discordLoading}
                  className="flex flex-col items-start gap-2 rounded-xl border border-[#5865F2]/25 bg-gradient-to-br from-[#5865F2]/15 to-transparent p-3 text-left transition-all hover:-translate-y-px hover:border-[#5865F2]/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[#5865F2]/20 text-[#7983F5]">
                    <DiscordIcon className="size-4" fill="currentColor" />
                  </span>
                  <span className="text-xs font-semibold leading-tight">
                    {discordLoading ? "Conectando…" : "Conecte seu Discord"}
                  </span>
                  <AuraAmount value={50} prefix="+" size="xs" tone="inherit" className="text-[11px] font-bold text-[#7983F5]" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-5 py-4">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              streak.current > 0 ? "bg-amber-400/15" : "bg-muted/60"
            )}
          >
            <Bird
              className={cn(
                "size-4",
                streak.current > 0 ? "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]" : "text-muted-foreground"
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">
              {streak.current > 0 ? (
                <span className="text-amber-400">
                  {streak.current} dia{streak.current === 1 ? "" : "s"} de ofensiva
                </span>
              ) : allDone ? (
                "Ofensiva iniciada"
              ) : (
                "Sem ofensiva ainda"
              )}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {streak.current > 0
                ? allDone
                  ? "Mantida hoje, volte amanhã"
                  : "Complete as 3 hoje para não perder"
                : allDone
                  ? "Volte amanhã para continuar"
                  : "Complete as 3 missões para começar"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1" aria-hidden>
            {DAILY_MISSION_KEYS.map(({ key }) => (
              <span
                key={key}
                className={cn("size-1.5 rounded-full", missions[key] ? "bg-amber-400" : "bg-muted-foreground/30")}
              />
            ))}
          </div>
        </div>

        <RouteLink
          href="/aura"
          className="group flex items-center justify-center gap-1.5 border-t border-border/60 px-5 py-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-orange-500/[0.06]"
        >
          Ver Central de Aura
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </RouteLink>
      </PopoverContent>
    </Popover>
  )
}
