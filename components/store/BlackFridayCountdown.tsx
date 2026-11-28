"use client"

import { useEffect, useState } from "react"
import { blackFridayMsLeft } from "@/lib/black-friday"
import { cn } from "@/lib/utils"

const UNITS = [
  { label: "dias", seconds: 86400, mod: Infinity },
  { label: "horas", seconds: 3600, mod: 24 },
  { label: "min", seconds: 60, mod: 60 },
  { label: "seg", seconds: 1, mod: 60 },
] as const

/**
 * Relógio da Black Friday (prazo em lib/black-friday.ts). Só liga depois de
 * montar: `Date.now()` no SSR diverge da hidratação. Antes disso reserva a
 * mesma caixa para não empurrar o layout. Avisa `onEnd` ao zerar.
 */
export function BlackFridayCountdown({ onEnd, className }: { onEnd?: () => void; className?: string }) {
  const [msLeft, setMsLeft] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const left = blackFridayMsLeft()
      setMsLeft(left)
      if (left === 0) {
        window.clearInterval(timer)
        onEnd?.()
      }
    }
    const timer = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(timer)
  }, [onEnd])

  const total = msLeft == null ? null : Math.floor(msLeft / 1000)

  return (
    <div
      className={cn("flex items-center gap-1 sm:gap-1.5", className)}
      role="timer"
      aria-label="Tempo restante da Black Friday"
    >
      {UNITS.map((unit, i) => {
        const value = total == null ? null : Math.floor(total / unit.seconds) % unit.mod
        return (
          <div key={unit.label} className="flex items-center gap-1 sm:gap-1.5">
            {i > 0 && <span className="pb-3 text-sm font-black text-amber-400/60">:</span>}
            <div className="flex flex-col items-center gap-0.5">
              <span className="flex h-9 min-w-[2.4rem] items-center justify-center rounded-[10px] border border-amber-400/45 bg-gradient-to-b from-[#1c1608] to-black px-1.5 font-display text-[17px] font-black tabular-nums text-amber-300 shadow-[0_0_18px_-8px_rgba(251,191,36,0.7)] sm:h-10 sm:min-w-[2.75rem] sm:text-[19px]">
                {value == null ? "--" : String(value).padStart(2, "0")}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200/55">{unit.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
