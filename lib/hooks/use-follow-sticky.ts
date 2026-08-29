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
 * A saída é alternar a âncora conforme a direção do scroll: descendo, o
 * elemento sobe junto até o rodapé dele encostar na base da viewport;
 * subindo, desce junto até o topo reencostar no header. Entre as trocas ele
 * fica "solto" num offset absoluto, o que dá a sensação de arrasto natural.
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

    // Respeita quem pediu menos movimento na interface.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    let lastScrollY = window.scrollY
    // Offset atual do elemento em relação ao topo do container pai.
    let translate = 0
    let frame = 0

    function apply() {
      frame = 0
      const node = ref.current
      if (!node) return

      const parent = node.parentElement
      if (!parent) return

      // Abaixo de `lg` a sidebar é estática/dialog — não mexe.
      if (window.innerWidth < 1024) {
        node.style.transform = ""
        translate = 0
        return
      }

      // O próprio sticky do CSS já resolve `--sticky-header-h`; ler o `top`
      // computado evita interpretar a var na mão. Ela troca de unidade
      // conforme o contexto — `4rem` no CSS base, `px` quando o
      // ChangelogBanner a sobrescreve — e muda quando o banner some.
      const stickyTop = (parseFloat(getComputedStyle(node).top) || 0) + topGap

      const viewportH = window.innerHeight
      const elH = node.offsetHeight
      const scrollY = window.scrollY
      const delta = scrollY - lastScrollY
      lastScrollY = scrollY

      // Cabe na tela: sticky nativo pelo topo já basta.
      if (elH + stickyTop <= viewportH) {
        node.style.transform = ""
        translate = 0
        return
      }

      // Quanto o elemento pode deslizar dentro do pai antes de passar do fim.
      const maxTranslate = Math.max(0, parent.offsetHeight - elH)
      // Limites de deslize: rodapé encostando na base / topo encostando no header.
      const parentTop = parent.getBoundingClientRect().top + scrollY
      const lowerBound = scrollY + viewportH - bottomGap - elH - parentTop
      const upperBound = scrollY + stickyTop - parentTop

      if (delta > 0) {
        // Descendo: pode avançar até o rodapé alinhar com a base da viewport.
        translate = Math.min(Math.max(translate, 0), Math.max(0, lowerBound))
      } else if (delta < 0) {
        // Subindo: recua até o topo alinhar com o header.
        translate = Math.max(Math.min(translate, upperBound), 0)
      }

      translate = Math.min(Math.max(translate, 0), maxTranslate)
      node.style.transform = translate > 0 ? `translateY(${translate}px)` : ""
    }

    function onScroll() {
      if (reduceMotion.matches) return
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
    }
  }, [topGap, bottomGap])

  return ref
}
