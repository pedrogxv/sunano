"use client"

import { useCallback, useEffect, useRef } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** Inclinação do card, em graus, quando o ponteiro está numa das bordas. */
const MAX_TILT_DEG = 8

/**
 * Quantos graus de inclinação FÍSICA do aparelho (em torno da postura em que
 * o usuário começou a olhar o card) equivalem à inclinação MÁXIMA do card.
 * Mais estreito que isso e o foil trepida com o tremor natural da mão.
 */
const GYRO_RANGE_DEG = 20

interface DeviceOrientationEventiOS {
  requestPermission?: () => Promise<"granted" | "denied">
}

type OrientationListener = (deltaBeta: number, deltaGamma: number) => void

/**
 * Estado do giroscópio é módulo-level (não por card): um `deviceorientation`
 * só existe por aparelho, então um único listener alimentando todos os cards
 * abertos custa o mesmo que um e evita destravar o mesmo rAF dezenas de vezes
 * por quadro quando a grade de medalhas tem várias cartas na tela.
 */
const orientationListeners = new Set<OrientationListener>()
let orientationBaseline: { beta: number; gamma: number } | null = null
let orientationAttached = false
let latestDelta: { beta: number; gamma: number } | null = null
let orientationFrame = 0

function flushOrientationFrame() {
  orientationFrame = 0
  if (!latestDelta) return
  for (const listener of orientationListeners) listener(latestDelta.beta, latestDelta.gamma)
}

function handleDeviceOrientation(event: DeviceOrientationEvent) {
  if (event.beta === null || event.gamma === null) return
  // A primeira leitura vira o "neutro": ninguém segura o celular perfeitamente
  // vertical pra ler a tela, então zerar contra 0° faria o card nascer torto.
  if (!orientationBaseline) orientationBaseline = { beta: event.beta, gamma: event.gamma }
  latestDelta = {
    beta: event.beta - orientationBaseline.beta,
    gamma: event.gamma - orientationBaseline.gamma,
  }
  if (!orientationFrame) orientationFrame = requestAnimationFrame(flushOrientationFrame)
}

/** Liga o listener global uma única vez por sessão de página. */
function ensureOrientationAttached() {
  if (orientationAttached || typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return
  orientationAttached = true
  window.addEventListener("deviceorientation", handleDeviceOrientation)

  // iOS 13+ só entrega os eventos depois de uma permissão concedida DENTRO de
  // um gesto do usuário — não dá pra pedir no mount. `once` no primeiro toque
  // ou clique em qualquer lugar da página cobre o card sem precisar de um
  // botão dedicado só para isso.
  const iosApi = window.DeviceOrientationEvent as unknown as DeviceOrientationEventiOS
  if (typeof iosApi.requestPermission === "function") {
    const requestOnGesture = () => {
      iosApi.requestPermission!().catch(() => {})
    }
    window.addEventListener("touchstart", requestOnGesture, { once: true, passive: true })
    window.addEventListener("click", requestOnGesture, { once: true })
  }
}

/**
 * Liga um card ao ponteiro (mouse) ou ao giroscópio (toque) para o efeito
 * holográfico (ver `.medal-holo` em app/globals.css). Devolve os handlers e
 * a ref para espalhar no elemento do card.
 *
 * Escreve as variáveis direto no DOM em vez de guardar a posição em estado:
 * `pointermove`/`deviceorientation` disparam dezenas de vezes por segundo e
 * cada `setState` seria um render da árvore inteira do card. O
 * `requestAnimationFrame` junta os eventos que caem no mesmo quadro — o
 * navegador entrega mais eventos do que quadros, e sem isso o
 * `getBoundingClientRect` roda à toa.
 *
 * Contrato escrito no elemento:
 * - `--holo-px` / `--holo-py`: onde o ponteiro (ou, no giroscópio, a
 *   inclinação convertida em posição) está no card, de 0 a 1.
 * - `--holo-rx` / `--holo-ry`: a inclinação correspondente, em graus.
 * - `--holo-on`: 1 com o efeito ativo, 0 fora.
 */
export function useHoloTilt<T extends HTMLElement>() {
  const frame = useRef(0)
  const reduced = useRef(false)
  const elementRef = useRef<T | null>(null)

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const sync = () => {
      reduced.current = query.matches
    }
    sync()
    query.addEventListener("change", sync)
    return () => {
      query.removeEventListener("change", sync)
      cancelAnimationFrame(frame.current)
    }
  }, [])

  // Giroscópio: toque não tem "passar por cima" (o dedo que encosta no card
  // está rolando a página), então no celular é a orientação FÍSICA do
  // aparelho que move o foil, não o dedo.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return

    const listener: OrientationListener = (deltaBeta, deltaGamma) => {
      if (reduced.current) return
      const element = elementRef.current
      if (!element) return
      const rx = Math.min(MAX_TILT_DEG, Math.max(-MAX_TILT_DEG, (-deltaBeta / GYRO_RANGE_DEG) * MAX_TILT_DEG))
      const ry = Math.min(MAX_TILT_DEG, Math.max(-MAX_TILT_DEG, (deltaGamma / GYRO_RANGE_DEG) * MAX_TILT_DEG))
      // Inverso da conversão do pointermove (rx = (0.5 - py) * 2 * MAX, ry =
      // (px - 0.5) * 2 * MAX) — mesma faixa 0..1 alimentando o mesmo shader.
      element.style.setProperty("--holo-px", (0.5 + ry / (2 * MAX_TILT_DEG)).toFixed(3))
      element.style.setProperty("--holo-py", (0.5 - rx / (2 * MAX_TILT_DEG)).toFixed(3))
      element.style.setProperty("--holo-rx", `${rx.toFixed(2)}deg`)
      element.style.setProperty("--holo-ry", `${ry.toFixed(2)}deg`)
      element.style.setProperty("--holo-on", "1")
    }

    orientationListeners.add(listener)
    ensureOrientationAttached()
    return () => {
      orientationListeners.delete(listener)
    }
  }, [])

  const setRef = useCallback((node: T | null) => {
    elementRef.current = node
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    // Toque é tratado pelo giroscópio acima, não por posição — inclinar o
    // card no meio do scroll só atrapalha.
    if (reduced.current || event.pointerType === "touch") return

    const element = event.currentTarget
    const { clientX, clientY } = event
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect()
      const px = (clientX - rect.left) / rect.width
      const py = (clientY - rect.top) / rect.height
      element.style.setProperty("--holo-px", px.toFixed(3))
      element.style.setProperty("--holo-py", py.toFixed(3))
      // Invertido no eixo X: o mouse subindo tem que jogar o topo do card
      // para trás, como se ele girasse em volta do próprio centro.
      element.style.setProperty("--holo-rx", `${((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
      element.style.setProperty("--holo-ry", `${((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
      element.style.setProperty("--holo-on", "1")
    })
  }, [])

  const onPointerLeave = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType === "touch") return
    cancelAnimationFrame(frame.current)
    const element = event.currentTarget
    // `--holo-px`/`--holo-py` ficam onde estavam de propósito: zerar junto
    // faria a faixa de arco-íris pular para o centro enquanto some. Como o
    // card deitado apaga a camada, a próxima entrada já chega com a posição
    // do ponteiro novo.
    element.style.setProperty("--holo-on", "0")
    element.style.setProperty("--holo-rx", "0deg")
    element.style.setProperty("--holo-ry", "0deg")
  }, [])

  return { ref: setRef, onPointerMove, onPointerLeave }
}
