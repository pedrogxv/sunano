"use client"

import { useEffect, type RefObject } from "react"

/**
 * Estica o trilho de cards (`STORE_CARD_RAIL_CLASS`) até as bordas do
 * `<main>`. O conteúdo da Loja é `max-w-7xl` centralizado: em tela larga o
 * trilho parava 32px depois da coluna e o card saía cortado no meio da
 * página, com um vão vazio até a borda.
 *
 * CSS sozinho não resolve: a distância até a borda depende da largura da
 * sidebar (que recolhe), e `container-type` no ancestral viraria bloco de
 * contenção para os `position: fixed` lá dentro (barra de compra do produto).
 * Mede aqui e grava `--rail-bleed-l`/`--rail-bleed-r` no trilho; sem JS (SSR)
 * a classe cai no respiro antigo (`--rail-pad`).
 */
export function useCardRailBleed(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const rail = ref.current
    const column = rail?.parentElement
    const main = rail?.closest("main")
    if (!rail || !column || !main) return

    const update = () => {
      const columnRect = column.getBoundingClientRect()
      const mainRect = main.getBoundingClientRect()
      rail.style.setProperty("--rail-bleed-l", `${Math.max(0, columnRect.left - mainRect.left)}px`)
      rail.style.setProperty("--rail-bleed-r", `${Math.max(0, mainRect.right - columnRect.right)}px`)
    }
    update()
    // Recolher a sidebar muda o <main> e desloca a coluna sem mudar a largura
    // dela: observa os dois.
    const observer = new ResizeObserver(update)
    observer.observe(column)
    observer.observe(main)
    return () => observer.disconnect()
  }, [ref])
}
