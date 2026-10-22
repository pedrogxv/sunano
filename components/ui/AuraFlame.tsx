import { useId } from "react"

import { cn } from "@/lib/utils"

import {
  AURA_FLAME_CORE_PATH,
  AURA_FLAME_INNER_PATH,
  AURA_FLAME_OUTER_PATH,
  AURA_FLAME_VIEW_BOX,
} from "@/components/ui/aura-flame-shape"

/**
 * A CHAMA VIVA DA AURA — o símbolo animado, para o ÍCONE DE DESTAQUE da tela.
 *
 * Três corpos sobrepostos (língua externa, corpo interno, núcleo), cada um
 * com o seu ciclo, a cama de brasa respirando embaixo e as fagulhas que sobem
 * da ponta. Dentro de um `.group`, o hover atiça o fogo (cresce e acelera). Toda a animação mora
 * no `globals.css` (bloco `.aura-flame`); aqui só existe a estrutura que
 * aquelas regras esperam.
 *
 * **Isto NÃO substitui o `AuraIcon`.** A chama viva é exceção, igual ao
 * `glow`: ela é para o ícone que a tela quer que puxe o olho (o herói da
 * Central de Aura, o card de saldo). Saldo em pílula, preço, contador,
 * ranking e badge continuam sendo `AuraIcon`/`AuraAmount` — se tudo pulsa,
 * nada pulsa.
 *
 * A silhueta vem de `aura-flame-shape.tsx`, a mesma que o `AuraIcon` desenha:
 * nunca redesenhe a forma aqui, senão o site volta a ter dois símbolos.
 *
 * ```tsx
 * <AuraFlame size="2xl" sparks />
 * <AuraFlame size="lg" />
 * ```
 */

/** Mesma escala de tokens do `AuraIcon` — tamanho é token, nunca número. */
export type AuraFlameSize = "sm" | "md" | "lg" | "xl" | "2xl"

const SIZE_CLASSES: Record<AuraFlameSize, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
  xl: "size-8",
  "2xl": "size-12 sm:size-14",
}

/**
 * Os três gradientes das camadas, DENTRO de cada chama, com ids de `useId`.
 *
 * Antes eles viviam num `<AuraFlameDefs />` por página, referenciado por id
 * fixo no CSS. Isso prendia a chama viva à Central: em qualquer outra página
 * (a sidebar está em todas) o `url(#...)` não resolvia e a chama saía sem
 * cor. Com o id por instância o componente acende sozinho onde for montado.
 */
function FlameGradients({ id }: { id: string }) {
  return (
    <defs>
      {/* Da base (brasa funda) para a ponta (fogo claro). */}
      <linearGradient id={`${id}-outer`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="oklch(0.6 0.23 28)" />
        <stop offset="45%" stopColor="oklch(0.69 0.21 45)" />
        <stop offset="100%" stopColor="oklch(0.8 0.17 70)" />
      </linearGradient>
      {/* Corpo interno — mais claro, é o que dá o volume. */}
      <linearGradient id={`${id}-inner`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="oklch(0.72 0.21 42)" />
        <stop offset="60%" stopColor="oklch(0.83 0.17 68)" />
        <stop offset="100%" stopColor="oklch(0.91 0.14 88)" />
      </linearGradient>
      {/* Núcleo — quase branco quente; é o ponto mais luminoso da chama. */}
      <linearGradient id={`${id}-core`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="oklch(0.9 0.14 80)" />
        <stop offset="100%" stopColor="oklch(0.98 0.06 95)" />
      </linearGradient>
    </defs>
  )
}

export interface AuraFlameProps {
  size?: AuraFlameSize
  /**
   * Fagulhas subindo da ponta. Custam três elementos posicionados por chama,
   * então ficam para o herói da tela — não para cada chama de uma lista.
   */
  sparks?: boolean
  className?: string
}

export function AuraFlame({ size = "md", sparks = false, className }: AuraFlameProps) {
  // `useId` devolve `«r1»`/`:r1:`, que não são válidos dentro de `url(#...)`.
  const id = `aura-flame-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <span className={cn("aura-flame", SIZE_CLASSES[size], className)} aria-hidden>
      {/* A cama de brasa: o clarão achatado de onde o fogo nasce. */}
      <span className="aura-flame-bed" />
      <svg className="aura-flame-svg" viewBox={AURA_FLAME_VIEW_BOX} focusable="false">
        <FlameGradients id={id} />
        <path className="aura-flame-body aura-flame-outer" d={AURA_FLAME_OUTER_PATH} fill={`url(#${id}-outer)`} />
        <path className="aura-flame-body aura-flame-inner" d={AURA_FLAME_INNER_PATH} fill={`url(#${id}-inner)`} />
        <path className="aura-flame-core" d={AURA_FLAME_CORE_PATH} fill={`url(#${id}-core)`} />
      </svg>
      {sparks && (
        <>
          {/* Os atrasos e a deriva de cada fagulha vêm do `:nth-of-type` no
              globals.css — são três de propósito. */}
          <i className="aura-flame-spark" />
          <i className="aura-flame-spark" />
          <i className="aura-flame-spark" />
        </>
      )}
    </span>
  )
}
