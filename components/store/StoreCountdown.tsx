"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface StoreCountdownProps {
  launchAt: string
  accentClassName?: string
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(launchAt: string): TimeLeft {
  const diff = Math.max(0, new Date(launchAt).getTime() - Date.now())
  const totalSeconds = Math.floor(diff / 1000)

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

const UNITS: Array<{ key: keyof TimeLeft; label: string }> = [
  { key: "days", label: "dias" },
  { key: "hours", label: "horas" },
  { key: "minutes", label: "min" },
  { key: "seconds", label: "seg" },
]

export function StoreCountdown({ launchAt, accentClassName }: StoreCountdownProps) {
  const router = useRouter()
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)

  useEffect(() => {
    setTimeLeft(getTimeLeft(launchAt))

    const interval = setInterval(() => {
      const next = getTimeLeft(launchAt)
      setTimeLeft(next)

      // O timer só provoca um refresh — quem decide se a Loja abre de fato é
      // o servidor, relendo STORE_MAINTENANCE_MODE. Se a env continuar true,
      // esta mesma tela volta a aparecer (com o countdown já zerado).
      if (next.days === 0 && next.hours === 0 && next.minutes === 0 && next.seconds === 0) {
        clearInterval(interval)
        router.refresh()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [launchAt, router])

  if (!timeLeft) {
    // Evita mismatch de hidratação: nada de números calculados no server render.
    return <div className="h-[4.5rem]" aria-hidden />
  }

  return (
    <div className="flex items-center gap-3" role="timer" aria-live="polite">
      {UNITS.map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "flex min-w-[3rem] items-center justify-center rounded-lg border px-2 py-1.5 text-xl font-black tabular-nums",
              accentClassName
            )}
          >
            {String(timeLeft[key]).padStart(2, "0")}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  )
}
