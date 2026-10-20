"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
}

export function AnimatedCounter({ value, duration = 2600, className }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    // Quem pediu menos movimento vê o número final já no primeiro frame.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let frame: number
    const start = performance.now()

    const tick = (now: number) => {
      const progress = reduceMotion ? 1 : Math.min((now - start) / duration, 1)
      const eased =
        progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2
      setDisplay(Math.round(eased * value))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  // O valor final, invisível na mesma célula do grid, reserva a largura desde
  // o primeiro frame. Sem ele o número crescia de "0" até "1.234" e empurrava
  // o rótulo ao lado a cada dígito novo: eram os layout shifts em série que o
  // Lighthouse apontava na pílula de números da Home.
  return (
    <span className={cn("inline-grid tabular-nums", className)}>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {value.toLocaleString("pt-BR")}
      </span>
      <span className="col-start-1 row-start-1">{display.toLocaleString("pt-BR")}</span>
    </span>
  )
}
