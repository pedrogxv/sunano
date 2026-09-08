"use client"

import { useMemo, type CSSProperties } from "react"

import { cn } from "@/lib/utils"
import type { MiniProfileBgTheme } from "@/lib/mini-profile-backgrounds"

/**
 * Camadas animadas de um Fundo de Mini Perfil comprado na Central de Aura.
 *
 * Renderiza SÓ o efeito — o fundo em degradê, as camadas (aurora, raios,
 * partículas…) e as classes de borda. Quem posiciona o conteúdo por cima é o
 * cartão que envolve isto. Assim o mesmo tema serve o cartão real
 * (`MiniProfileCard`), o preview da loja e o preview do editor de perfil, sem
 * três cópias das camadas.
 *
 * A arte é toda CSS (`.mpbg-*` em app/globals.css); aqui só se decide QUAIS
 * camadas existem e com que cor. As duas variáveis do contrato
 * (`--mpbg-accent`, `--mpbg-accent-2`) saem do tema.
 */

type MpbgStyle = CSSProperties & {
  "--mpbg-accent"?: string
  "--mpbg-accent-2"?: string
}

type ParticleStyle = CSSProperties & {
  "--mpbg-particle-left"?: string
  "--mpbg-particle-size"?: string
  "--mpbg-particle-duration"?: string
  "--mpbg-particle-delay"?: string
  "--mpbg-particle-drift"?: string
  "--mpbg-particle-color"?: string
}

/** Classe de borda por estilo do tema — `none` não acende nada. */
const BORDER_CLASS = {
  none: "",
  glow: "mpbg-border-glow",
  runner: "mpbg-border-runner",
  prismatic: "mpbg-border-prismatic",
} as const

/**
 * Espalhamento determinístico das partículas.
 *
 * Determinístico e não `Math.random()` de propósito: o cartão é renderizado
 * no cliente a cada abertura do hover, e um sorteio novo faria as partículas
 * "pularem" de posição a cada vez. O hash pelo índice + slug dá a mesma
 * constelação sempre, e ainda assim diferente entre dois temas.
 */
/**
 * Ruído determinístico em [0, 1) a partir de dois inteiros — o número da
 * partícula e qual das quatro propriedades se está sorteando.
 *
 * Função pura em vez de um gerador com estado: assim `n` partículas podem ser
 * calculadas em qualquer ordem, e o valor de cada uma depende só dos próprios
 * índices. (Um LCG com `state` mutável faria o mesmo, mas mutar uma variável
 * durante o render é justamente o que o compilador do React proíbe.)
 */
function noise(seed: number, index: number, channel: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + channel * 37.719) * 43758.5453
  return x - Math.floor(x)
}

function useParticles(theme: MiniProfileBgTheme): ParticleStyle[] {
  return useMemo(() => {
    const count = theme.particleCount ?? 12
    // Seed do slug: dois temas com a mesma contagem não ficam idênticos.
    let seed = 0
    for (let i = 0; i < theme.slug.length; i++) seed = (seed * 31 + theme.slug.charCodeAt(i)) % 100000

    return Array.from({ length: count }, (_, i) => {
      const r1 = noise(seed, i, 0)
      const r2 = noise(seed, i, 1)
      const r3 = noise(seed, i, 2)
      const r4 = noise(seed, i, 3)
      return {
        "--mpbg-particle-left": `${(r1 * 96 + 2).toFixed(1)}%`,
        // Faixa larga de tamanho E de velocidade. Quando todas as partículas
        // levam quase o mesmo tempo, o conjunto sobe como um bloco e lê como
        // animação de banco; com 5s a 14s, umas cruzam as outras e vira
        // profundidade — as lentas parecem estar mais longe.
        "--mpbg-particle-size": `${(r2 * 3.1 + 1.2).toFixed(1)}px`,
        "--mpbg-particle-duration": `${(r3 * 9 + 5).toFixed(2)}s`,
        // Espalha os atrasos por todo o ciclo: sem isso todas nascem juntas
        // no primeiro segundo e o efeito "pulsa" em vez de fluir. O termo com
        // `noise` tira o resto da regularidade do espaçamento por índice.
        "--mpbg-particle-delay": `${((i / count) * 7 + noise(seed, i, 4) * 2.5).toFixed(2)}s`,
        "--mpbg-particle-drift": `${(r4 * 54 - 27).toFixed(0)}px`,
        // Alterna as duas cores do tema para a poeira não ficar monocromática.
        "--mpbg-particle-color": i % 3 === 0 ? theme.accent2 : theme.accent,
      } satisfies ParticleStyle
    })
  }, [theme])
}

/**
 * Classe de borda do tema, para o elemento que DESENHA a borda do cartão.
 *
 * Fica separada das camadas porque a borda precisa viver no elemento externo
 * (a que tem o `border-radius` e de onde o halo escapa), enquanto as camadas
 * são recortadas dentro dele.
 */
export function miniProfileBgBorderClass(theme: MiniProfileBgTheme | null): string {
  if (!theme) return ""
  return BORDER_CLASS[theme.border]
}

/** As variáveis de cor do tema — aplicadas no mesmo elemento da borda. */
export function miniProfileBgVars(theme: MiniProfileBgTheme | null): MpbgStyle | undefined {
  if (!theme) return undefined
  return { "--mpbg-accent": theme.accent, "--mpbg-accent-2": theme.accent2 }
}

export function MiniProfileBackground({
  theme,
  className,
}: {
  theme: MiniProfileBgTheme
  className?: string
}) {
  const particles = useParticles(theme)
  const layers = new Set(theme.layers)

  return (
    // `-z-0` mantém as camadas atrás do conteúdo do cartão (que fica em
    // `relative z-[1]`), mas ainda dentro do stacking context de `.mpbg-root`.
    <div
      className={cn("mpbg-root pointer-events-none absolute inset-0 overflow-hidden", className)}
      // `data-mpbg` é o gancho das assinaturas por tema em `globals.css`:
      // ângulo, velocidade e escala que fazem dois temas com as MESMAS
      // camadas não lerem como a mesma arte em outra cor.
      data-mpbg={theme.slug}
      style={{ backgroundImage: theme.background }}
      aria-hidden
    >
      {layers.has("aurora") && <span className="mpbg-layer mpbg-aurora" />}
      {layers.has("rays") && <span className="mpbg-layer mpbg-rays" />}
      {layers.has("orbit") && <span className="mpbg-layer mpbg-orbit" />}
      {layers.has("scanline") && <span className="mpbg-layer mpbg-scanline" />}
      {layers.has("bolt") && <span className="mpbg-layer mpbg-bolt" />}
      {layers.has("particles") && (
        <span className="mpbg-layer">
          {particles.map((style, i) => (
            <span key={i} className="mpbg-particle" style={style} />
          ))}
        </span>
      )}
      {/* O brilho holográfico passa por cima de tudo — é reflexo na
          "superfície" do cartão, não mais uma coisa dentro da cena. */}
      {layers.has("sheen") && <span className="mpbg-layer mpbg-sheen" />}
    </div>
  )
}
