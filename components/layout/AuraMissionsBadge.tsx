"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Bird, Check, Flame, MessageSquare, Sparkles, SquarePen } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthUser } from "@/components/providers/auth-context"
import { AURA_CHANGED_EVENT } from "@/lib/client/aura-events"
import {
  DAILY_MISSION_KEYS,
  DAILY_MISSION_REWARDS,
  EMPTY_DAILY_MISSIONS,
  countCompletedMissions,
  type DailyMissionKey,
  type DailyMissionsState,
  type UserStreak,
} from "@/lib/achievements"
import { cn } from "@/lib/utils"

type AuraUsage = {
  balance: number
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

const EMPTY_STREAK: UserStreak = { current: 0, longest: 0 }

/** Mesmo intervalo de fallback do sino de notificações — cobre missões cumpridas fora do evento de aura (criar post/comentário). */
const POLL_MS = 60_000

/**
 * Ícone único de Aura + missões na TopBar (substitui os antigos `MissionsBadge`
 * e `AuraBalanceBadge` separados). Por padrão mostra só o saldo total de Aura
 * do usuário; passar o mouse (desktop) ou tocar (mobile) abre um popover com
 * o progresso das 3 missões diárias, a ofensiva atual e o limite diário de
 * reações de Aura (`givenToday/limit`).
 */
export function AuraMissionsBadge() {
  const { user } = useAuthUser()
  const [open, setOpen] = useState(false)
  const [missions, setMissions] = useState<DailyMissionsState | null>(null)
  const [streak, setStreak] = useState<UserStreak>(EMPTY_STREAK)
  const [usage, setUsage] = useState<AuraUsage | null>(null)

  const loadMissions = useCallback(async () => {
    try {
      const res = await fetch("/api/achievements/missions")
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      setMissions(data.missions ?? EMPTY_DAILY_MISSIONS)
      setStreak(data.streak ?? EMPTY_STREAK)
    } catch {
      setMissions(EMPTY_DAILY_MISSIONS)
    }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/aura/summary")
      setUsage(res.ok ? await res.json() : null)
    } catch {
      setUsage(null)
    }
  }, [])

  const loadAll = useCallback(() => {
    void loadMissions()
    void loadUsage()
  }, [loadMissions, loadUsage])

  useEffect(() => {
    if (!user) return
    loadAll()
    const id = setInterval(loadAll, POLL_MS)
    window.addEventListener(AURA_CHANGED_EVENT, loadAll)
    return () => {
      clearInterval(id)
      window.removeEventListener(AURA_CHANGED_EVENT, loadAll)
    }
  }, [user, loadAll])

  if (!user) return null

  if (!missions || !usage) {
    return <Skeleton className="size-11 shrink-0 rounded-lg sm:h-8 sm:w-16" />
  }

  const completed = countCompletedMissions(missions)
  const allDone = completed === DAILY_MISSION_KEYS.length
  const frozen = usage.limitReached

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Aura: ${usage.balance} — ${completed}/${DAILY_MISSION_KEYS.length} missões diárias`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="animate-fade-in-up relative flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/70 text-sm font-semibold tabular-nums text-foreground transition-all hover:bg-muted/40 sm:h-8 sm:w-auto sm:px-3"
        >
          <Flame className="size-[15px] shrink-0 text-orange-500" fill="currentColor" strokeWidth={1.5} />
          <span className="hidden leading-none sm:inline">{usage.balance}</span>
          {!allDone && (
            <span className="absolute -right-1 -top-1 flex size-2.5 items-center justify-center rounded-full bg-primary sm:hidden" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
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
                  <Link
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
                  </Link>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <Bird
            className={cn("size-4 shrink-0", streak.current > 0 ? "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]" : "text-muted-foreground")}
          />
          <p className="text-xs text-muted-foreground">
            {streak.current > 0 ? (
              <>
                <span className="font-semibold text-amber-400">{streak.current} dia{streak.current === 1 ? "" : "s"}</span> de ofensiva
                {allDone ? " — mantida hoje!" : ". Complete as 3 hoje para não perder."}
              </>
            ) : allDone ? (
              "Ofensiva iniciada — volte amanhã para continuar."
            ) : (
              "Complete as 3 missões hoje para começar uma ofensiva."
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
