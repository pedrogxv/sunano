import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { cn } from "@/lib/utils"

/**
 * Loader do site: a calopsita da marca dando pulinhos, com barra de progresso
 * indeterminada e "Carregando..." embaixo.
 *
 * É a ÚNICA fonte de verdade do "carregando" em tela cheia/seção — trocar o
 * visual do loading é mexer aqui (e no bloco `.sunano-loader` do globals.css),
 * nunca numa tela. Skeleton continua sendo o `loading.tsx` de rota; este é o
 * spinner de quando ainda não há forma para esboçar.
 */

const SIZE = {
  sm: { bird: "size-10", bar: "w-20", text: "text-[11px]" },
  md: { bird: "size-20", bar: "w-36", text: "text-xs" },
  lg: { bird: "size-28", bar: "w-48", text: "text-sm" },
} as const

interface SunanoLoaderProps {
  size?: keyof typeof SIZE
  /** Texto embaixo da barra (e lido pelo leitor de tela). */
  label?: string
  /** Esconde barra e texto: só a calopsita, para espaços apertados. */
  compact?: boolean
  className?: string
}

export function SunanoLoader({
  size = "md",
  label = "Carregando",
  compact = false,
  className,
}: SunanoLoaderProps) {
  const s = SIZE[size]

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("sunano-loader inline-flex flex-col items-center gap-4 py-6", className)}
    >
      <div className="relative flex flex-col items-center">
        <span aria-hidden className="sunano-loader-glow" />
        <span aria-hidden className="sunano-loader-feather sunano-loader-feather-1" />
        <span aria-hidden className="sunano-loader-feather sunano-loader-feather-2" />
        <span aria-hidden className="sunano-loader-feather sunano-loader-feather-3" />
        <SunanoIcon className={cn("sunano-loader-bird relative", s.bird)} />
        <span aria-hidden className="sunano-loader-shadow" />
      </div>

      {compact ? (
        <span className="sr-only">{label}</span>
      ) : (
        <div className="flex flex-col items-center gap-2.5">
          <div aria-hidden className={cn("sunano-loader-track", s.bar)}>
            <span className="sunano-loader-bar" />
          </div>
          <span className={cn("font-medium tracking-wide text-muted-foreground", s.text)}>
            {label}
            <span aria-hidden className="sunano-loader-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
