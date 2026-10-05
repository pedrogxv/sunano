"use client"

import { useEffect, useRef } from "react"

/**
 * Sticky que acompanha a rolagem mesmo quando o elemento é mais alto que a
 * viewport — o comportamento das sidebars do Reddit.
 *
 * O `position: sticky` puro só resolve um dos dois casos: ancorado pelo topo
 * ele prende a sidebar alta e o rodapé dela fica inalcançável; ancorado pelo
 * rodapé (`bottom`) ela só gruda no fim da rolagem e não parece fixa.
 *
 * A saída é mover o `top` do próprio sticky junto com a rolagem: descendo, o
 * `top` cai (fica negativo) e o elemento sobe com a página até o rodapé dele
 * encostar na base da viewport; subindo, o `top` volta até o topo reencostar
 * no header. Entre os dois limites ele anda junto com a página, o que dá a
 * sensação de arrasto natural.
 *
 * Nunca com `transform`: o deslocamento do sticky já acompanha o scroll, e o
 * `translateY` somava por cima dele. A sidebar ficava presa no topo com os
 * últimos cards fora da tela e, rolando mais, escorregava para baixo.
 *
 * Elementos que cabem na viewport pulam toda essa lógica e usam sticky comum.
 *
 * @param topGap respiro extra em px somado ao `top` que o CSS já define.
 * @param bottomGap respiro em px na base quando o elemento está mais alto.
 */
export function useFollowSticky<T extends HTMLElement>(topGap = 0, bottomGap = 16) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let lastScrollY = window.scrollY
    // Último `top` escrito pelo hook; `null` = vale o `top` do CSS.
    let top: number | null = null
    let frame = 0

    function apply() {
      frame = 0
      const node = ref.current
      if (!node) return

      const scrollY = window.scrollY
      const delta = scrollY - lastScrollY
      lastScrollY = scrollY

      // Limpa o inline antes de medir: o `top` computado tem de ser o do CSS,
      // não o que este hook escreveu no frame anterior. Ler o computado evita
      // interpretar `--sticky-header-h` na mão: ela troca de unidade conforme
      // o contexto (`4rem` no CSS base, `px` quando o ChangelogBanner a
      // sobrescreve) e muda quando o banner some.
      node.style.top = ""

      // Abaixo de `lg` a sidebar é estática/dialog — não mexe.
      if (window.innerWidth < 1024) {
        top = null
        return
      }

      const stickyTop = (parseFloat(getComputedStyle(node).top) || 0) + topGap
      const viewportH = window.innerHeight
      const elH = node.offsetHeight

      // Cabe na tela: sticky nativo pelo topo já basta.
      if (elH + stickyTop <= viewportH) {
        top = null
        return
      }

      // `top` mais baixo possível: rodapé encostado na base da viewport.
      const minTop = Math.min(stickyTop, viewportH - bottomGap - elH)
      top = Math.min(Math.max((top ?? stickyTop) - delta, minTop), stickyTop)
      node.style.top = `${top}px`
    }

    // Sem checar `prefers-reduced-motion`: não há animação, a sidebar só rola
    // junto com a página. Desligar o hook ali deixava o rodapé inalcançável.
    function onScroll() {
      // Uma atualização por frame — scroll dispara muito mais que isso.
      if (frame === 0) frame = window.requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)

    // Cards recolhendo mudam a altura sem gerar scroll nem resize.
    const observer = new ResizeObserver(onScroll)
    observer.observe(el)

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      el.style.top = ""
    }
  }, [topGap, bottomGap])

  return ref
}
