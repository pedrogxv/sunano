"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface AuraNextSlotCountdownProps {
  nextSlotAt: string
}

interface TimeLeft {
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(nextSlotAt: string): TimeLeft {
  const diff = Math.max(0, new Date(nextSlotAt).getTime() - Date.now())
  const totalSeconds = Math.floor(diff / 1000)

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

/**
 * Contagem regressiva até o rolling window de 24h liberar mais uma reação
 * de Aura (ver `getUserAuraUsage`, `DAILY_AURA_GIVE_LIMIT`). Mesmo padrão de
 * `components/store/StoreCountdown.tsx`: só decide a UI, quem decide se o
 * limite de fato liberou é o servidor — ao zerar, só dá um `router.refresh()`
 * pra reler o estado real.
 */
export function AuraNextSlotCountdown({ nextSlotAt }: AuraNextSlotCountdownProps) {
  const router = useRouter()
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)

  useEffect(() => {
    setTimeLeft(getTimeLeft(nextSlotAt))

    const interval = setInterval(() => {
      const next = getTimeLeft(nextSlotAt)
      setTimeLeft(next)

      if (next.hours === 0 && next.minutes === 0 && next.seconds === 0) {
        clearInterval(interval)
        router.refresh()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [nextSlotAt, router])

  if (!timeLeft) {
    // Evita mismatch de hidratação: nada de números calculados no server render.
    return <p className="font-display text-2xl font-bold text-foreground">--:--:--</p>
  }

  const pad = (n: number) => String(n).padStart(2, "0")

  return (
    <p className="font-display text-2xl font-bold tabular-nums text-foreground" role="timer" aria-live="polite">
      {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
    </p>
  )
}
