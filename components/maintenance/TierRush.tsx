"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { TIER_BASE_COLORS } from "@/lib/tierlist-theme"
import { useT } from "@/lib/use-t"

/**
 * "Tier Rush" — o mini-jogo da tela de manutenção.
 *
 * A ideia é ser um jogo que só o Sunano poderia ter: em vez de um runner
 * genérico, o jogador faz o que o site inteiro faz — **tierar periférico**.
 * Cai um item (mouse, teclado, headset, mousepad, fonte…) com uma nota, e você
 * manda para o tier certo antes de ele chegar no chão. Os tiers, as cores e o
 * vocabulário vêm todos das fontes reais do projeto:
 * `NEW_TIERS`/`TIER_BASE_COLORS` (lib/tierlist-theme.ts) e os rótulos de
 * categoria da tierlist. Inclusive a regra do "BOMBA": em Fontes, o tier L
 * não se chama L (ver `tierLabel` em lib/tier-utils.ts).
 *
 * Decisões que valem registro:
 *
 * - **Sem consulta ao banco.** Seria tentador cair periférico de verdade da
 *   tabela `peripherals`, mas esta tela é exibida justamente quando o banco
 *   pode estar no meio de uma migração. O catálogo é gerado a partir de
 *   constantes locais; o jogo funciona com o backend inteiro fora do ar.
 *
 * - **A nota decide o tier, e a regra é visível.** Cada item cai com um score
 *   de 0 a 100 e uma faixa fixa mapeia score → tier. O jogador aprende a
 *   escala do site jogando, em vez de adivinhar.
 *
 * - **Sem `useState` por frame.** A queda é animada por rAF com o tempo em
 *   refs; o React só re-renderiza quando algo que a UI mostra muda de fato
 *   (item atual, vidas, pontos, combo).
 *
 * - **Teclado é cidadão de primeira classe.** 1–7 mandam para os sete tiers,
 *   então dá para jogar inteiro sem mouse — e os botões existem para toque.
 */

const TIERS = ["GOAT", "SS", "S", "A", "B", "C", "L"] as const
type TierKey = (typeof TIERS)[number]

/**
 * Faixa de nota de cada tier. É a régua que o jogo ensina — e a mesma ordem
 * de `NEW_TIERS`, do melhor para o pior.
 */
const TIER_RANGES: Array<{ tier: TierKey; min: number; max: number }> = [
  { tier: "GOAT", min: 95, max: 100 },
  { tier: "SS", min: 88, max: 94 },
  { tier: "S", min: 78, max: 87 },
  { tier: "A", min: 66, max: 77 },
  { tier: "B", min: 50, max: 65 },
  { tier: "C", min: 30, max: 49 },
  { tier: "L", min: 0, max: 29 },
]

function tierForScore(score: number): TierKey {
  return TIER_RANGES.find((r) => score >= r.min && score <= r.max)?.tier ?? "C"
}

/**
 * Catálogo local. `psu` está aqui de propósito: é a categoria que troca o
 * rótulo do último tier para BOMBA, e é uma piada interna que quem conhece o
 * site reconhece.
 */
const CATEGORIES = [
  { key: "mouse", label: "Mouse", glyph: "mouse" },
  { key: "keyboard", label: "Teclado", glyph: "keyboard" },
  { key: "headset", label: "Headset", glyph: "headset" },
  { key: "mousepad", label: "Mousepad", glyph: "mousepad" },
  { key: "monitors", label: "Monitor", glyph: "monitor" },
  { key: "psu", label: "Fonte", glyph: "psu" },
] as const

type CategoryKey = (typeof CATEGORIES)[number]["key"]
type Glyph = (typeof CATEGORIES)[number]["glyph"]

// Nomes fictícios montados na hora: soam como periférico sem imitar marca real.
const PREFIX = ["Vex", "Nova", "Kaze", "Orb", "Zen", "Halo", "Riff", "Lumo", "Pyx", "Astra"]
const SUFFIX = ["X", "Pro", "TKL", "Air", "One", "GT", "Mini", "HE", "V2", "Ultra"]

type Item = {
  id: number
  name: string
  category: CategoryKey
  label: string
  glyph: Glyph
  score: number
  tier: TierKey
}

/** Rótulo do tier respeitando a exceção de Fontes (L vira BOMBA). */
function tierLabelFor(tier: TierKey, category: CategoryKey) {
  return category === "psu" && tier === "L" ? "BOMBA" : tier
}

let nextId = 1
function makeItem(): Item {
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]
  const score = Math.floor(Math.random() * 101)
  return {
    id: nextId++,
    name: `${PREFIX[Math.floor(Math.random() * PREFIX.length)]} ${
      SUFFIX[Math.floor(Math.random() * SUFFIX.length)]
    }`,
    category: cat.key,
    label: cat.label,
    glyph: cat.glyph,
    score,
    tier: tierForScore(score),
  }
}

const BEST_STORAGE_KEY = "sunano:maintenance-tierrush-best"
const START_LIVES = 3
/** Tempo (ms) para decidir o primeiro item. Cai a cada acerto, com piso. */
const START_TIME = 4200
const MIN_TIME = 1500
const TIME_STEP = 130

function readBest(): number {
  // localStorage lança em janela privada / site data bloqueado. Recorde é
  // conveniência: nunca pode derrubar a tela.
  try {
    const raw = window.localStorage.getItem(BEST_STORAGE_KEY)
    const n = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeBest(v: number) {
  try {
    window.localStorage.setItem(BEST_STORAGE_KEY, String(v))
  } catch {
    /* sessão sem persistência */
  }
}

type Phase = "idle" | "playing" | "over"
type Feedback = { kind: "hit" | "miss"; tier: TierKey; correct: TierKey; category: CategoryKey } | null

/** Ícone do periférico em SVG inline — nada de request de imagem nesta tela. */
function PeripheralGlyph({ glyph, className }: { glyph: Glyph; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {glyph === "mouse" && (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="5" {...common} />
          <path d="M12 6.5v4" {...common} />
        </>
      )}
      {glyph === "keyboard" && (
        <>
          <rect x="2" y="6" width="20" height="12" rx="2" {...common} />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" {...common} />
        </>
      )}
      {glyph === "headset" && (
        <>
          <path d="M4 14v-2a8 8 0 1 1 16 0v2" {...common} />
          <rect x="2.5" y="13.5" width="4" height="7" rx="1.6" {...common} />
          <rect x="17.5" y="13.5" width="4" height="7" rx="1.6" {...common} />
        </>
      )}
      {glyph === "mousepad" && (
        <>
          <rect x="2" y="6" width="20" height="12" rx="2" {...common} />
          <path d="M2 15h20" {...common} />
        </>
      )}
      {glyph === "monitor" && (
        <>
          <rect x="2.5" y="4" width="19" height="12.5" rx="2" {...common} />
          <path d="M9 20h6M12 16.5V20" {...common} />
        </>
      )}
      {glyph === "psu" && (
        <>
          <rect x="2.5" y="6" width="19" height="12" rx="2" {...common} />
          <circle cx="9" cy="12" r="3.2" {...common} />
          <path d="M17 9.5v5" {...common} />
        </>
      )}
    </svg>
  )
}

export function TierRush() {
  const t = useT()
  const m = t.maintenance

  const [phase, setPhase] = useState<Phase>("idle")
  const [item, setItem] = useState<Item | null>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [lives, setLives] = useState(START_LIVES)
  const [combo, setCombo] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isNewBest, setIsNewBest] = useState(false)
  // 1 → acabou de nascer, 0 → bateu no chão. Só para a barra/queda.
  const [progress, setProgress] = useState(1)

  const phaseRef = useRef<Phase>("idle")
  const deadlineRef = useRef(0)
  const durationRef = useRef(START_TIME)
  const scoreRef = useRef(0)
  const livesRef = useRef(START_LIVES)
  const comboRef = useRef(0)
  const lockRef = useRef(false)
  const reducedMotion = useRef(false)

  useEffect(() => {
    setBest(readBest())
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  const endGame = useCallback(() => {
    phaseRef.current = "over"
    setPhase("over")
    setItem(null)
    if (scoreRef.current > readBest()) {
      writeBest(scoreRef.current)
      setBest(scoreRef.current)
      setIsNewBest(true)
    }
  }, [])

  const spawn = useCallback(() => {
    const next = makeItem()
    setItem(next)
    setProgress(1)
    deadlineRef.current = performance.now() + durationRef.current
    lockRef.current = false
  }, [])

  const start = useCallback(() => {
    scoreRef.current = 0
    livesRef.current = START_LIVES
    comboRef.current = 0
    durationRef.current = START_TIME
    setScore(0)
    setLives(START_LIVES)
    setCombo(0)
    setFeedback(null)
    setIsNewBest(false)
    phaseRef.current = "playing"
    setPhase("playing")
    spawn()
  }, [spawn])

  const loseLife = useCallback(
    (fb: Feedback) => {
      comboRef.current = 0
      setCombo(0)
      livesRef.current -= 1
      setLives(livesRef.current)
      setFeedback(fb)
      if (livesRef.current <= 0) {
        endGame()
        return
      }
      spawn()
    },
    [endGame, spawn],
  )

  const choose = useCallback(
    (tier: TierKey) => {
      if (phaseRef.current !== "playing" || !item || lockRef.current) return
      lockRef.current = true

      if (tier === item.tier) {
        // Combo multiplica: acertar em sequência vale mais que acertar avulso.
        comboRef.current += 1
        const gained = 10 + Math.min(comboRef.current, 10) * 2
        scoreRef.current += gained
        setCombo(comboRef.current)
        setScore(scoreRef.current)
        setFeedback({ kind: "hit", tier, correct: item.tier, category: item.category })
        durationRef.current = Math.max(MIN_TIME, durationRef.current - TIME_STEP)
        spawn()
      } else {
        loseLife({ kind: "miss", tier, correct: item.tier, category: item.category })
      }
    },
    [item, loseLife, spawn],
  )

  // Relógio da queda. Um único rAF; `progress` só muda o suficiente para a
  // barra andar, e o timeout é detectado aqui (não com setTimeout, que
  // dessincronizaria da animação).
  useEffect(() => {
    if (phase !== "playing") return
    let raf = 0
    let disposed = false

    function tick() {
      if (disposed) return
      const left = deadlineRef.current - performance.now()
      const p = Math.max(0, Math.min(1, left / durationRef.current))
      setProgress(p)

      if (left <= 0 && !lockRef.current && item) {
        lockRef.current = true
        loseLife({ kind: "miss", tier: item.tier, correct: item.tier, category: item.category })
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
    }
  }, [phase, item, loseLife])

  // Teclado: 1–7 escolhem o tier na ordem exibida.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== "playing") {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault()
          start()
        }
        return
      }
      const n = Number.parseInt(e.key, 10)
      if (n >= 1 && n <= TIERS.length) {
        e.preventDefault()
        choose(TIERS[n - 1])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [choose, start])

  // Some com o feedback sozinho para não poluir a tela.
  useEffect(() => {
    if (!feedback) return
    const id = window.setTimeout(() => setFeedback(null), 900)
    return () => window.clearTimeout(id)
  }, [feedback])

  const rangeHint = useMemo(
    () => TIER_RANGES.map((r) => `${r.tier} ${r.min}+`).join(" · "),
    [],
  )

  return (
    <div className="w-full text-left">
      {/* Placar */}
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span>
          {m.gameScore} <span className="tabular-nums text-foreground">{score}</span>
        </span>
        <span className="flex items-center gap-2">
          {combo > 1 && (
            <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-amber-200">
              {m.gameCombo} ×{combo}
            </span>
          )}
          <span aria-label={`${lives} ${m.gameLives}`} className="tracking-normal">
            {"♥".repeat(Math.max(0, lives))}
            <span className="text-muted-foreground/25">{"♥".repeat(Math.max(0, START_LIVES - lives))}</span>
          </span>
          <span>
            {m.gameBest} <span className="tabular-nums text-foreground">{best}</span>
          </span>
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4">
        {/* Área do item */}
        <div className="relative flex h-[132px] items-center justify-center sm:h-[136px]">
          {phase === "playing" && item && (
            <div
              key={item.id}
              className="flex w-full max-w-sm flex-col items-center"
              style={
                reducedMotion.current
                  ? undefined
                  : // A carta desce conforme o tempo passa: o "prazo" é visível
                    // sem precisar ler número nenhum.
                    { transform: `translateY(${(1 - progress) * 26}px)` }
              }
            >
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card px-4 py-3 shadow-lg">
                <PeripheralGlyph glyph={item.glyph} className="size-8 shrink-0 text-foreground/80" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                </div>
                <div className="ml-2 shrink-0 text-right">
                  <p className="font-display text-2xl font-bold leading-none tabular-nums text-foreground">
                    {item.score}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.gameRating}</p>
                </div>
              </div>

              {/* Barra de tempo */}
              <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-75 ease-linear"
                  style={{
                    width: `${progress * 100}%`,
                    background: progress > 0.35 ? "#22C55E" : progress > 0.15 ? "#F59E0B" : "#EF4444",
                  }}
                />
              </div>
            </div>
          )}

          {/* Feedback do último lance */}
          {feedback && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
              aria-live="polite"
            >
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: feedback.kind === "hit" ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)",
                  color: feedback.kind === "hit" ? "#4ADE80" : "#FCA5A5",
                }}
              >
                {feedback.kind === "hit"
                  ? m.gameNice
                  : `${m.gameWas} ${tierLabelFor(feedback.correct, feedback.category)}`}
              </span>
            </div>
          )}

          {/* Overlay de início / fim */}
          {phase !== "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/50 text-center backdrop-blur-[2px]">
              {phase === "over" && (
                <>
                  <p className="font-display text-lg font-bold text-foreground">
                    {isNewBest ? m.gameNewBest : m.gameOver}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.gameScore}: <span className="tabular-nums">{score}</span>
                  </p>
                </>
              )}
              {phase === "idle" && (
                <p className="max-w-xs px-4 text-xs text-muted-foreground">{m.gameIntro}</p>
              )}
              <button
                type="button"
                onClick={start}
                className="mt-1 rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {phase === "over" ? m.gameRestart : m.gameStart}
              </button>
            </div>
          )}
        </div>

        {/* Botoeira de tiers */}
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {TIERS.map((tier, index) => {
            const label = item ? tierLabelFor(tier, item.category) : tier
            return (
              <button
                key={tier}
                type="button"
                disabled={phase !== "playing"}
                onClick={() => choose(tier)}
                title={`${label} — ${TIER_RANGES[index].min}+`}
                // `text-[10px]` no mobile: "GOAT" e "BOMBA" são os rótulos mais
                // longos e encostavam nas bordas da coluna em telas de 390px.
                className="group relative rounded-lg px-0.5 py-2 text-center text-[10px] font-bold leading-none text-black transition disabled:opacity-35 sm:text-sm"
                style={{ background: TIER_BASE_COLORS[tier] }}
              >
                <span className="block leading-none">{label}</span>
                <span className="mt-0.5 block text-[9px] font-semibold leading-none opacity-70">
                  {index + 1}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-2.5 text-center text-[10px] leading-relaxed text-muted-foreground/70">{rangeHint}</p>
      </div>
    </div>
  )
}
