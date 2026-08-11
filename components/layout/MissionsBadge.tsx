"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Bird, Check, MessageSquare, Sparkles, SquarePen, Target } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
 * Ícone de missões diárias na TopBar — badge "x/3" enquanto falta alguma,
 * vira o pássaro da Ofensiva (com o número de dias) quando as 3 já foram
 * cumpridas hoje. Clique abre um painel com o detalhe das 3 missões e a
 * ofensiva atual; cada missão pendente linka para onde ela é cumprida
 * (`MISSION_HREFS`). Única exibição das missões diárias — não há mais
 * versão no perfil.
 */
export function MissionsBadge() {
  const { user } = useAuthUser()
  const [missions, setMissions] = useState<DailyMissionsState | null>(null)
  const [streak, setStreak] = useState<UserStreak>(EMPTY_STREAK)

  const load = useCallback(async () => {
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

  useEffect(() => {
    if (!user) return
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    window.addEventListener(AURA_CHANGED_EVENT, load)
    return () => {
      clearInterval(id)
      window.removeEventListener(AURA_CHANGED_EVENT, load)
    }
  }, [user, load])

  if (!user || !missions) return null

  const completed = countCompletedMissions(missions)
  const allDone = completed === DAILY_MISSION_KEYS.length

  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={allDone ? `Missões diárias completas — ofensiva de ${streak.current} dias` : `Missões diárias: ${completed}/${DAILY_MISSION_KEYS.length}`}
          className={cn(
            "relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70 text-sm font-medium text-foreground transition-all hover:bg-muted/40 sm:h-8 sm:w-auto sm:px-3",
            allDone && "border-amber-400/40"
          )}
        >
          {allDone ? (
            <Bird className="size-[15px] text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]" />
          ) : (
            <Target className="size-[15px] text-primary" />
          )}
          <span className={cn("hidden leading-none sm:ml-1.5 sm:inline", allDone && "text-amber-400")}>
            {allDone ? streak.current : `${completed}/${DAILY_MISSION_KEYS.length}`}
          </span>
          {!allDone && (
            <span className="absolute -right-1 -top-1 flex size-2.5 items-center justify-center rounded-full bg-primary sm:hidden" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-2rem))] bg-popover p-0 text-foreground shadow-md"
      >
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
