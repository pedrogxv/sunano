import { cn } from "@/lib/utils"

import { AURA_FLAME_OUTER_PATH, AURA_FLAME_VIEW_BOX } from "@/components/ui/aura-flame-shape"

/**
 * A CHAMA DA AURA — o símbolo da moeda do site, num lugar só.
 *
 * **Toda** referência nova à Aura (saldo, custo, contador, ranking, badge,
 * pílula, botão) usa este componente. Nunca escreva `<Flame>` à mão: foi
 * exatamente assim que o site acumulou a mesma chama em cinco cores
 * diferentes — `text-primary` (que é BRANCO PURO no tema, então a chama saía
 * sem cor nenhuma), `text-orange-500`, `text-orange-400`, `text-amber-400` e
 * sem cor —, cada tela com o seu `fill`/`strokeWidth`.
 *
 * Se um dia a moeda mudar de símbolo ou de cor, muda aqui e muda no site
 * inteiro.
 *
 * ```tsx
 * <AuraIcon />                      // padrão: laranja da Aura, tamanho md
 * <AuraIcon size="xs" />            // dentro de uma pílula/badge
 * <AuraIcon tone="inherit" />       // dentro de algo que já define a cor
 * <AuraIcon glow />                 // com a animação de pulso (destaque)
 * ```
 */

/**
 * Tamanho é TOKEN, não número — mesma regra do `ProfileAvatar`. Um tamanho
 * solto obriga a reacertar o `strokeWidth` junto e é o que fazia cada tela
 * divergir. Para um tamanho fora da escala, use `className`.
 */
export type AuraIconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

const SIZE_CLASSES: Record<AuraIconSize, string> = {
  xs: "size-2.5",
  sm: "size-3",
  md: "size-3.5",
  lg: "size-4",
  xl: "size-5",
  "2xl": "size-8 sm:size-9",
}

/**
 * Cor da chama.
 *
 * - `brand` (padrão) — o laranja da Aura. É a cor da moeda; use sempre que o
 *   ícone estiver sobre fundo neutro.
 * - `inherit` — herda a cor de quem contém (botão com cor própria, pílula já
 *   colorida, linha de ranking). Evita a chama brigar com o texto ao lado.
 * - `muted` — rótulo secundário, onde a chama não é o destaque.
 */
export type AuraIconTone = "brand" | "inherit" | "muted"

/**
 * Cor de marca da Aura, exportada para as poucas telas que precisam dela
 * SOLTA (config de ícone genérico, texto ao lado do número). Ninguém deve
 * redigitar o literal: `primary` é BRANCO no tema, e foi essa a origem da
 * chama sem cor.
 */
export const AURA_BRAND_COLOR_CLASS = "text-orange-500"

/** Fundo do círculo atrás da chama — mesma cor, bem diluída. */
export const AURA_BRAND_BG_CLASS = "bg-orange-500/10"

const TONE_CLASSES: Record<AuraIconTone, string> = {
  brand: AURA_BRAND_COLOR_CLASS,
  inherit: "",
  muted: "text-muted-foreground",
}

export interface AuraIconProps {
  size?: AuraIconSize
  tone?: AuraIconTone
  /**
   * Chama VAZADA (só contorno), para quando ela é rótulo e não valor — ex.:
   * "Próxima aura liberada". O padrão é chapada: a Aura é uma chama cheia.
   */
  outline?: boolean
  /**
   * Pulso + halo (`aura-stat-icon`). Só para o ícone que a tela quer que puxe
   * o olho — se tudo pulsa, nada pulsa. O halo atrás exige o wrapper
   * `aura-stat-icon-holder`, que `AuraIconHolder` fornece.
   */
  glow?: boolean
  className?: string
  "aria-hidden"?: boolean
}

export function AuraIcon({
  size = "md",
  tone = "brand",
  outline = false,
  glow = false,
  className,
  "aria-hidden": ariaHidden = true,
}: AuraIconProps) {
  return (
    <svg
      aria-hidden={ariaHidden}
      viewBox={AURA_FLAME_VIEW_BOX}
      focusable="false"
      className={cn(SIZE_CLASSES[size], TONE_CLASSES[tone], glow && "aura-stat-icon", className)}
    >
      {/* A forma vem de `aura-flame-shape.tsx`, a MESMA que o `AuraFlame`
          animado desenha — é o que impede o site de ter dois símbolos. */}
      <path
        d={AURA_FLAME_OUTER_PATH}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill={outline ? "none" : "currentColor"}
      />
    </svg>
  )
}

/**
 * A chama como VALOR de config (`React.ElementType`), para as telas que
 * guardam `icon: AuraFlameIcon` numa tabela — rankings de `/pessoas`, trilhas
 * de conquista, tipos de notificação, emblema de moldura, botão de reação.
 * Essas telas não conseguem chamar `<AuraIcon>` direto, e era por isso que
 * caíam no `Flame` do lucide e a moeda voltava a divergir.
 *
 * Se o mapa que recebe isto estiver tipado como `typeof Bell`/`LucideIcon`,
 * ALARGUE para `React.ElementType` — amarrar o mapa ao tipo da lib é o que
 * prendia a moeda ao ícone do lucide.
 */
export function AuraFlameIcon({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      viewBox={AURA_FLAME_VIEW_BOX}
      focusable="false"
      className={cn("size-4", className)}
      {...props}
    >
      <path
        d={AURA_FLAME_OUTER_PATH}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * Wrapper do halo que respira atrás da chama (`aura-stat-icon-holder`). Só
 * faz sentido junto de `<AuraIcon glow />` — o halo é desenhado pelo
 * `::before` deste elemento, então a chama sozinha não o teria.
 */
export function AuraIconHolder({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("aura-stat-icon-holder inline-flex shrink-0", className)}>{children}</span>
  )
}

/**
 * Chama + valor — o jeito padrão de escrever uma QUANTIA de Aura (preço,
 * saldo, desconto, total). Existe para o par ícone+número não ser remontado
 * em cada tela: era assim que um lugar mostrava a chama em SVG e o de ao lado
 * o emoji 🔥, com espaçamento diferente.
 *
 * O número já vai formatado em pt-BR (`toLocaleString`) — não passe o valor
 * pré-formatado.
 *
 * ```tsx
 * <AuraAmount value={item.auraCost} />
 * <AuraAmount value={savings} prefix="−" tone="inherit" />
 * ```
 */
export function AuraAmount({
  value,
  size = "md",
  tone = "inherit",
  /** Sinal colado antes do número, ex. "−" num desconto. */
  prefix,
  className,
}: {
  value: number
  size?: AuraIconSize
  tone?: AuraIconTone
  prefix?: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      <AuraIcon size={size} tone={tone} />
      {prefix}
      {value.toLocaleString("pt-BR")}
    </span>
  )
}
