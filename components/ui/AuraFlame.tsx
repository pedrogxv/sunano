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
 * com o seu ciclo, mais as fagulhas que sobem da ponta. Toda a animação mora
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
 * <AuraFlameDefs />              // UMA vez por página (os gradientes)
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
 * Os três gradientes das camadas, uma vez por página.
 *
 * O CSS referencia os gradientes por `id` (`fill: url(#aura-flame-grad-*)`),
 * e `id` é global no documento: repetir as `<defs>` em cada chama duplicaria
 * os ids, e o navegador passa a resolver todos para o PRIMEIRO — então basta
 * um `<AuraFlameDefs />` no topo da página e todas as chamas dela acendem.
 */
export function AuraFlameDefs() {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0" focusable="false">
      <defs>
        {/* Da base (brasa funda) para a ponta (fumaça quente): a língua
            externa é a mais fria nas extremidades, por isso ela some no topo. */}
        <linearGradient id="aura-flame-grad-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.62 0.23 28)" />
          <stop offset="45%" stopColor="oklch(0.7 0.21 45)" />
          <stop offset="100%" stopColor="oklch(0.78 0.18 65)" />
        </linearGradient>
        {/* Corpo interno — mais claro, é o que dá o volume. */}
        <linearGradient id="aura-flame-grad-inner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.72 0.21 40)" />
          <stop offset="60%" stopColor="oklch(0.82 0.18 65)" />
          <stop offset="100%" stopColor="oklch(0.9 0.15 85)" />
        </linearGradient>
        {/* Núcleo — quase branco quente; é o ponto mais luminoso da chama. */}
        <linearGradient id="aura-flame-grad-core" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.88 0.15 75)" />
          <stop offset="100%" stopColor="oklch(0.97 0.08 95)" />
        </linearGradient>
      </defs>
    </svg>
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
  return (
    <span className={cn("aura-flame", SIZE_CLASSES[size], className)} aria-hidden>
      <svg className="aura-flame-svg" viewBox={AURA_FLAME_VIEW_BOX} focusable="false">
        <path className="aura-flame-body aura-flame-outer" d={AURA_FLAME_OUTER_PATH} />
        <path className="aura-flame-body aura-flame-inner" d={AURA_FLAME_INNER_PATH} />
        <path className="aura-flame-core" d={AURA_FLAME_CORE_PATH} />
      </svg>
      {sparks && (
        <>
          {/* Os atrasos e a deriva de cada fagulha vêm do `:nth-child` no
              globals.css — são três de propósito. */}
          <span className="aura-flame-spark" />
          <span className="aura-flame-spark" />
          <span className="aura-flame-spark" />
        </>
      )}
    </span>
  )
}
