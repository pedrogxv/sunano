"use client"

import { useEffect } from "react"

/**
 * Mede INP e LCP de visitantes REAIS e reporta só o que está ruim.
 *
 * O PageSpeed mostra a média de 28 dias do Chrome (CrUX) sem dizer QUAL
 * interação é lenta, e o Lighthouse não interage com a página — o INP de
 * 327ms do celular não aparecia em laboratório (TBT de 10ms). Sem saber o
 * elemento, qualquer correção de INP seria chute.
 *
 * Sem serviço externo nem biblioteca: `PerformanceObserver` nativo, e o
 * relatório vai para `/api/vitals`, que só escreve no log da função (nada de
 * banco). Para não virar custo, só reporta quando o valor está acima do
 * limite "bom" do Google e numa amostra de 1 em `SAMPLE_RATE` visitas.
 */

const SAMPLE_RATE = 10
/** Limites "bom" do Google: acima disso, a interação/pintura entra no relatório. */
const INP_REPORT_MS = 200
const LCP_REPORT_MS = 2500

/** `interactionId` ainda não está no lib.dom do TypeScript. */
type EventTiming = PerformanceEventTiming & { interactionId?: number }

type Report = {
  metric: "INP" | "LCP"
  value: number
  path: string
  target: string
  eventType?: string
  inputDelay?: number
  processing?: number
  presentation?: number
  loadState: string
}

/** Seletor curto e legível do elemento (`button.nav-fire#cart`), sem conteúdo do usuário. */
function describe(node: Node | null | undefined): string {
  const parts: string[] = []
  let el = node instanceof Element ? node : null
  for (let depth = 0; el && depth < 3; depth++) {
    let part = el.tagName.toLowerCase()
    if (el.id) part += `#${el.id}`
    const slot = el.getAttribute("data-slot")
    if (slot) part += `[data-slot=${slot}]`
    const classes = Array.from(el.classList).slice(0, 2)
    if (classes.length) part += `.${classes.join(".")}`
    parts.unshift(part)
    el = el.parentElement
  }
  return parts.join(" > ").slice(0, 200)
}

function send(report: Report) {
  try {
    const body = JSON.stringify(report)
    if (!navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/vitals", { method: "POST", body, keepalive: true }).catch(() => {})
    }
  } catch {
    // Medição nunca pode quebrar a página.
  }
}

export function VitalsReporter() {
  useEffect(() => {
    if (Math.floor(Math.random() * SAMPLE_RATE) !== 0) return
    if (typeof PerformanceObserver === "undefined") return

    const supported = PerformanceObserver.supportedEntryTypes ?? []
    // Navegação client-side troca a URL sem recarregar: guarda a rota de
    // quando a interação aconteceu, não a de quando o relatório sai.
    const initialPath = location.pathname
    let worstEvent: EventTiming | null = null
    let worstPath = initialPath
    let lcp: { value: number; element: Element | null } | null = null
    const observers: PerformanceObserver[] = []

    if (supported.includes("event")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as EventTiming[]) {
          // Só interações de verdade (clique, toque, tecla) têm interactionId.
          if (!entry.interactionId) continue
          if (!worstEvent || entry.duration > worstEvent.duration) {
            worstEvent = entry
            worstPath = location.pathname
          }
        }
      })
      observer.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit)
      observers.push(observer)
    }

    if (supported.includes("largest-contentful-paint")) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as Array<PerformanceEntry & { element?: Element | null }>
        const last = entries[entries.length - 1]
        if (last) lcp = { value: last.startTime, element: last.element ?? null }
      })
      observer.observe({ type: "largest-contentful-paint", buffered: true })
      observers.push(observer)
    }

    let sent = false
    const flush = () => {
      if (sent || document.visibilityState !== "hidden") return
      sent = true
      const loadState = document.readyState
      if (worstEvent && worstEvent.duration >= INP_REPORT_MS) {
        const start = worstEvent.startTime
        send({
          metric: "INP",
          value: Math.round(worstEvent.duration),
          path: worstPath,
          target: describe(worstEvent.target),
          eventType: worstEvent.name,
          inputDelay: Math.round(worstEvent.processingStart - start),
          processing: Math.round(worstEvent.processingEnd - worstEvent.processingStart),
          presentation: Math.round(start + worstEvent.duration - worstEvent.processingEnd),
          loadState,
        })
      }
      if (lcp && lcp.value >= LCP_REPORT_MS) {
        send({ metric: "LCP", value: Math.round(lcp.value), path: initialPath, target: describe(lcp.element), loadState })
      }
    }

    document.addEventListener("visibilitychange", flush)
    return () => {
      document.removeEventListener("visibilitychange", flush)
      for (const observer of observers) observer.disconnect()
    }
  }, [])

  return null
}
