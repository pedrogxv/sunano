"use client"

import { useCallback, useEffect, useRef } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** Inclinação do card, em graus, quando o ponteiro está numa das bordas. */
const MAX_TILT_DEG = 8

/**
 * Liga um card ao ponteiro para o efeito holográfico (ver `.medal-holo` em
 * app/globals.css). Devolve os handlers para espalhar no elemento do card.
 *
 * Escreve as variáveis direto no DOM em vez de guardar a posição em estado:
 * `pointermove` dispara dezenas de vezes por segundo e cada `setState` seria
 * um render da árvore inteira do card. O `requestAnimationFrame` junta os
 * eventos que caem no mesmo quadro — o navegador entrega mais `pointermove`
 * do que quadros, e sem isso o `getBoundingClientRect` roda à toa.
 *
 * O elemento sai de `event.currentTarget`, não de um `ref`: como os handlers
 * moram no próprio card, `currentTarget` já é ele. Um ref aqui seria só mais
 * uma peça para o chamador ter que encaixar no lugar certo.
 *
 * Contrato escrito no elemento:
 * - `--holo-px` / `--holo-py`: onde o ponteiro está no card, de 0 a 1.
 * - `--holo-rx` / `--holo-ry`: a inclinação correspondente, em graus.
 * - `--holo-on`: 1 com o ponteiro em cima, 0 fora.
 */
export function useHoloTilt<T extends HTMLElement>() {
  const frame = useRef(0)
  const reduced = useRef(false)

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

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    // Toque não tem "passar por cima": o dedo que encosta no card está
    // rolando a página, e inclinar o card no meio do scroll só atrapalha.
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

  return { onPointerMove, onPointerLeave }
}
