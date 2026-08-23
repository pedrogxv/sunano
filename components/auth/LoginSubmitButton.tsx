"use client"

import { useFormStatus } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { useRef, useState } from "react"
import { MousePointer2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PARTICLE_COLORS = ["#22d3ee", "#8b5cf6", "#22d3ee", "#a78bfa", "#67e8f9"]

const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 10
  return {
    id: i,
    x: Math.cos(angle) * (26 + (i % 3) * 8),
    y: Math.sin(angle) * (26 + (i % 3) * 8),
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  }
})

/**
 * Botão de "Entrar" com uma animação de clique temática de periférico gamer:
 * um cursor desliza até o botão, "clica" (RGB burst de partículas cyan/violeta
 * — mesma paleta do AuthBackground/AuthModalGlow) e o botão reage com um pulso
 * de energia, antes do form realmente submeter via pending state do React.
 */
export function LoginSubmitButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus()
  const [burst, setBurst] = useState(false)
  const burstTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = () => {
    setBurst(true)
    if (burstTimeout.current) clearTimeout(burstTimeout.current)
    burstTimeout.current = setTimeout(() => setBurst(false), 600)
  }

  return (
    <div className="group/login-btn relative isolate">
      <Button
        className={cn(
          "relative w-full overflow-hidden transition-[box-shadow,transform] duration-300",
          burst && "scale-[0.97]"
        )}
        disabled={pending || disabled}
        type="submit"
        onClick={handleClick}
      >
        <motion.span
          className="pointer-events-none absolute inset-0 -z-10 opacity-0"
          style={{
            background:
              "radial-gradient(circle, rgba(34,211,238,0.55), rgba(139,92,246,0.4) 55%, transparent 75%)",
          }}
          animate={burst ? { opacity: [0, 1, 0], scale: [0.6, 1.6, 1.8] } : { opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />

        {/* Cursor gamer que desliza até o botão e "clica" ao submeter */}
        <motion.span
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 hidden text-foreground/90 drop-shadow-[0_0_6px_rgba(34,211,238,0.9)] sm:block"
          initial={{ x: -80, y: 40, opacity: 0, rotate: -12 }}
          animate={
            burst
              ? { x: -8, y: -6, opacity: [0, 1, 1, 0], rotate: 0, scale: [1, 0.85, 1] }
              : { x: -80, y: 40, opacity: 0 }
          }
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <MousePointer2 className="size-4 fill-cyan-300/90" strokeWidth={2} />
        </motion.span>

        {/* Burst de partículas RGB, cores da identidade visual do site */}
        <AnimatePresence>
          {burst && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 -z-10">
              {PARTICLES.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute size-1 rounded-full"
                  style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              ))}
            </span>
          )}
        </AnimatePresence>

        <motion.span
          className="relative z-10 inline-flex items-center gap-1.5"
          animate={burst ? { y: [0, -1, 0] } : { y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {pending ? "Entrando…" : "Entrar"}
        </motion.span>
      </Button>
    </div>
  )
}
