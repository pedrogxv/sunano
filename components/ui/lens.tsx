"use client"

// Adaptado do registry MagicUI (`lens`): https://magicui.design/r/lens.json
// Import trocado de "motion/react" para "framer-motion" — já é a lib de
// animação usada no resto do projeto, sem precisar instalar o pacote "motion".
import React, { useCallback, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useMotionTemplate } from "framer-motion"

import { cn } from "@/lib/utils"

interface Position {
  /** A coordenada x da lupa. */
  x: number
  /** A coordenada y da lupa. */
  y: number
}

interface LensProps {
  /** O conteúdo que a lupa amplia (normalmente uma imagem). */
  children: React.ReactNode
  /** Fator de zoom aplicado dentro da lupa. */
  zoomFactor?: number
  /** Diâmetro da lupa em pixels. */
  lensSize?: number
  /** Posição fixa da lupa (usado com `isStatic`). */
  position?: Position
  /** Posição exibida antes do primeiro hover. */
  defaultPosition?: Position
  /** Mantém a lupa sempre visível na `position` informada, sem seguir o mouse. */
  isStatic?: boolean
  /** Duração da animação de entrada/saída, em segundos. */
  duration?: number
  /** Cor usada na máscara circular (mantida em "black": só a opacidade importa). */
  lensColor?: string
  ariaLabel?: string
  className?: string
}

export function Lens({
  children,
  zoomFactor = 1.8,
  lensSize = 200,
  isStatic = false,
  position = { x: 0, y: 0 },
  defaultPosition,
  duration = 0.1,
  lensColor = "black",
  ariaLabel = "Área de zoom",
  className,
}: LensProps) {
  if (zoomFactor < 1) {
    throw new Error("zoomFactor must be greater than 1")
  }
  if (lensSize < 0) {
    throw new Error("lensSize must be greater than 0")
  }

  const [isHovering, setIsHovering] = useState(false)
  const [mousePosition, setMousePosition] = useState<Position>(position)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentPosition = useMemo(() => {
    if (isStatic) return position
    if (defaultPosition && !isHovering) return defaultPosition
    return mousePosition
  }, [isStatic, position, defaultPosition, isHovering, mousePosition])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setIsHovering(false)
  }, [])

  const maskImage = useMotionTemplate`radial-gradient(circle ${
    lensSize / 2
  }px at ${currentPosition.x}px ${
    currentPosition.y
  }px, ${lensColor} 100%, transparent 100%)`

  const LensContent = useMemo(() => {
    const { x, y } = currentPosition

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.58 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration }}
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage,
          WebkitMaskImage: maskImage,
          transformOrigin: `${x}px ${y}px`,
          zIndex: 50,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `scale(${zoomFactor})`,
            transformOrigin: `${x}px ${y}px`,
          }}
        >
          {children}
        </div>
      </motion.div>
    )
  }, [currentPosition, maskImage, zoomFactor, children, duration])

  return (
    <div
      ref={containerRef}
      className={cn("relative z-20 size-full overflow-hidden rounded-xl", className)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {children}
      {isStatic || defaultPosition ? (
        LensContent
      ) : (
        <AnimatePresence mode="popLayout">
          {isHovering && LensContent}
        </AnimatePresence>
      )}
    </div>
  )
}
