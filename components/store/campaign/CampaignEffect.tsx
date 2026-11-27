import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"
import type { StoreCampaignEffect } from "@/lib/store-campaigns"

/**
 * Efeitos de fundo do cabeçalho de campanha. Só desenham: as cores saem das
 * variáveis `--cmp-*` do tema (app/globals.css), então o mesmo efeito serve a
 * qualquer campanha. Tudo determinístico (sem `Math.random`), para o servidor
 * e o navegador montarem o mesmo HTML. Quem pede menos movimento não vê nada
 * disso (CSS).
 */

/**
 * Fogos. Posição em % do painel; ficam no vão entre o título e o contador (e
 * nos cantos), nunca em cima do texto. `only`: no celular o painel é estreito
 * e o texto ocupa quase tudo, então lá estouram só os dos cantos.
 */
const BURSTS: { x: string; y: string; r: number; dur: number; delay: number; only?: "desktop" | "mobile" }[] = [
  { x: "57%", y: "42%", r: 105, dur: 2.9, delay: 0, only: "desktop" },
  { x: "70%", y: "24%", r: 75, dur: 3.4, delay: 1.2, only: "desktop" },
  { x: "47%", y: "22%", r: 62, dur: 3.1, delay: 2.3, only: "desktop" },
  { x: "66%", y: "76%", r: 70, dur: 3.7, delay: 0.7, only: "desktop" },
  { x: "49%", y: "80%", r: 55, dur: 3.5, delay: 3, only: "desktop" },
  { x: "97%", y: "8%", r: 58, dur: 3.2, delay: 1.8, only: "desktop" },
  { x: "2%", y: "96%", r: 52, dur: 3.8, delay: 2.7, only: "desktop" },
  { x: "88%", y: "12%", r: 75, dur: 2.9, delay: 0.3, only: "mobile" },
  { x: "78%", y: "88%", r: 68, dur: 3.4, delay: 1.6, only: "mobile" },
  { x: "4%", y: "94%", r: 45, dur: 3.7, delay: 2.8, only: "mobile" },
]
/** Duas coroas de faíscas por fogo: a de fora (raio cheio) e a de dentro, mais curta, que enche o estouro. */
const SPARKS = 24
const SPARK_COLORS = ["var(--cmp-p1)", "var(--cmp-p1)", "var(--cmp-p2)", "var(--cmp-p2)"]

/** Brilhinhos parados que piscam entre um estouro e outro. */
const STARS = [
  ["40%", "12%", 0], ["52%", "68%", 1.1], ["62%", "12%", 0.4], ["74%", "54%", 1.8],
  ["60%", "88%", 0.9], ["80%", "84%", 2.4], ["96%", "40%", 1.5], ["3%", "8%", 2], ["44%", "48%", 0.6],
] as const

function Fireworks() {
  return (
    <>
      {STARS.map(([x, y, d], i) => (
        <span key={i} className="cmp-star" style={{ left: x, top: y, animationDelay: `${d}s` }} />
      ))}
      {BURSTS.map((b, i) => (
        <div
          key={i}
          className={cn("cmp-firework", b.only === "desktop" && "max-sm:hidden", b.only === "mobile" && "sm:hidden")}
          style={{ left: b.x, top: b.y, "--dur": `${b.dur}s`, "--d": `${b.delay}s` } as CSSProperties}
        >
          <span className="cmp-rocket" />
          <span className="cmp-flash" style={{ "--fs": `${b.r * 1.1}px` } as CSSProperties} />
          <span className="cmp-burst-fall">
            {Array.from({ length: SPARKS }, (_, s) => {
              const inner = s % 2 === 1
              return (
                <span
                  key={s}
                  className={cn("cmp-spark", inner && "cmp-spark-inner")}
                  style={{
                    "--a": `${(360 / SPARKS) * s + (inner ? 7 : 0)}deg`,
                    "--r": `${inner ? Math.round(b.r * 0.6) : b.r}px`,
                    "--c": SPARK_COLORS[s % SPARK_COLORS.length],
                  } as CSSProperties}
                />
              )
            })}
          </span>
        </div>
      ))}
    </>
  )
}

/**
 * Neve e confete: partículas caindo do topo ao pé do painel. Cada uma é uma
 * coluna da altura do painel que desliza para baixo (o `%` do transform é da
 * própria coluna, logo da altura do painel, em qualquer tela).
 */
const FALLING = 34
const CONFETTI_COLORS = ["var(--cmp-p1)", "var(--cmp-p2)", "var(--cmp-p3)", "var(--cmp-p4, var(--cmp-p1))"]

function Falling({ kind }: { kind: "snow" | "confetti" }) {
  return (
    <>
      {Array.from({ length: FALLING }, (_, i) => {
        // Espalhamento fixo, sem aleatório: primos diferentes desencontram as colunas.
        const left = (i * 37) % 100
        const dur = 6 + ((i * 13) % 7)
        const delay = -((i * 1.9) % dur)
        const size = kind === "snow" ? 2 + ((i * 7) % 4) : 5 + ((i * 3) % 3)
        return (
          <span
            key={i}
            className={cn("cmp-fall-col", i % 3 === 2 && "max-sm:hidden")}
            style={{ left: `${left}%`, "--dur": `${dur}s`, "--d": `${delay}s` } as CSSProperties}
          >
            <span
              className={kind === "snow" ? "cmp-flake" : "cmp-confetti"}
              style={{
                "--s": `${size}px`,
                "--c": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                "--sway": `${(i % 2 ? 1 : -1) * (6 + (i % 5) * 2)}px`,
                "--spin": `${1.2 + (i % 4) * 0.4}s`,
              } as CSSProperties}
            />
          </span>
        )
      })}
    </>
  )
}

export function CampaignEffect({ effect }: { effect: StoreCampaignEffect }) {
  return (
    <div aria-hidden className="cmp-effect pointer-events-none absolute inset-0 overflow-hidden">
      {effect === "fireworks" ? <Fireworks /> : <Falling kind={effect === "snow" ? "snow" : "confetti"} />}
    </div>
  )
}
