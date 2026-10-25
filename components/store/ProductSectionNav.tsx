"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  AlignLeft,
  ArrowUp,
  LayoutGrid,
  ListChecks,
  Star,
  type LucideIcon,
} from "lucide-react"
import { storageImgProps } from "@/lib/storage-thumb"
import { cn } from "@/lib/utils"

export type ProductSectionId =
  | "descricao"
  | "especificacoes"
  | "relacionados"
  | "avaliacoes"

export type ProductSectionLink = {
  id: ProductSectionId
  label: string
  /** Contador ao lado do rótulo (ex: nº de avaliações). `0` também aparece: diz que não há. */
  count?: number
}

const SECTION_ICON: Record<ProductSectionId, LucideIcon> = {
  descricao: AlignLeft,
  especificacoes: ListChecks,
  relacionados: LayoutGrid,
  avaliacoes: Star,
}

/**
 * Índice das seções da página de produto, em forma de cápsula flutuante:
 * presa no topo enquanto a pessoa rola a parte de baixo, com um realce que
 * desliza até a seção atual e uma linha de progresso de leitura. Ao grudar,
 * mostra a miniatura do produto e um atalho de volta à compra. As seções usam
 * `PRODUCT_SECTION_SCROLL_MARGIN` para o título não parar embaixo dela.
 */
export function ProductSectionNav({
  sections,
  thumbUrl,
  productName,
  backToId,
  className,
}: {
  sections: ProductSectionLink[]
  thumbUrl?: string | null
  productName: string
  /** Para onde o botão de voltar leva (o bloco de compra). */
  backToId: string
  className?: string
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const [active, setActive] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  const [gone, setGone] = useState(false)
  const [progress, setProgress] = useState(0)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  // A lista é montada a cada render do pai: a dependência é o conteúdo, não a referência.
  const ids = sections.map((section) => section.id).join(",")

  // Seção escolhida no clique. Vale até a pessoa rolar por conta própria: a
  // rolagem do clique pode não levar a seção até a linha de leitura (seção
  // curta no fim da página) e passa pelas do meio no caminho — sem a trava a
  // aba piscava por elas e às vezes acabava em outra.
  const lockedRef = useRef<string | null>(null)
  // Até quando a rolagem é a do clique (fim pelo `scrollend`, ou um teto para
  // o Safari, que não tem o evento).
  const settleUntilRef = useRef(0)
  const updateRef = useRef<() => void>(() => {})

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const wrapper = wrapperRef.current
      const nav = navRef.current
      if (!wrapper || !nav) return
      const elements = ids
        .split(",")
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null)
      if (elements.length === 0) return
      const viewport = window.innerHeight
      const tops = elements.map((el) => el.getBoundingClientRect().top)
      const lastBottom = Math.max(
        ...elements.map((el) => el.getBoundingClientRect().bottom)
      )

      // Presa por `fixed`, não `sticky`: a cápsula mora na coluna da galeria,
      // e `sticky` só gruda dentro do pai — ela soltaria no fim da descrição,
      // antes de Relacionados e Avaliações. O wrapper guarda o lugar dela.
      const stickyTop = parseFloat(getComputedStyle(nav).top)
      const slot = wrapper.getBoundingClientRect()
      const pinned = slot.top <= stickyTop
      wrapper.style.height = pinned ? `${nav.offsetHeight}px` : ""
      nav.style.left = pinned ? `${slot.left}px` : ""
      nav.style.maxWidth = pinned ? `${slot.width}px` : ""
      setStuck(pinned)
      // Passou da última seção (rodapé): sai de cena em vez de flutuar sobre ele.
      setGone(pinned && lastBottom < stickyTop + nav.offsetHeight + READING_GAP)
      const rect = nav.getBoundingClientRect()

      // Linha de leitura: um terço da área abaixo da cápsula, e nunca abaixo
      // da metade da tela. A seção vira a atual quando o título cruza a linha,
      // não só quando encosta na cápsula; o teto evita a Descrição já marcada
      // com a página parada no topo (a cápsula solta lá embaixo puxava a linha).
      const line = Math.min(
        rect.bottom + Math.max(READING_GAP, (viewport - rect.bottom) / 3),
        viewport / 2,
      )
      const atBottom =
        window.scrollY + viewport >= document.documentElement.scrollHeight - 2

      let current: string | null = null
      if (lockedRef.current && ids.split(",").includes(lockedRef.current)) {
        current = lockedRef.current
      } else if (atBottom) {
        // No fim da página a última seção curta nunca chega à linha: vale a
        // última que aparece na tela.
        for (let i = elements.length - 1; i >= 0; i--) {
          if (tops[i] < viewport) {
            current = elements[i].id
            break
          }
        }
      } else {
        let currentTop = -Infinity
        elements.forEach((el, i) => {
          // Estrito: descrição e ficha dividem a linha no desktop, e a
          // primeira das duas é a que fica marcada.
          if (tops[i] <= line && tops[i] > currentTop) {
            current = el.id
            currentTop = tops[i]
          }
        })
      }
      setActive(current)

      // Progresso: 0 quando a primeira seção chega à cápsula, 1 no fim da página
      // ou quando o fim da última seção entra na tela.
      const scrollY = window.scrollY
      const begin = tops[0] + scrollY - rect.bottom - READING_GAP
      const finish = Math.min(
        lastBottom + scrollY - viewport,
        document.documentElement.scrollHeight - viewport
      )
      setProgress(
        atBottom
          ? 1
          : finish > begin
            ? Math.min(1, Math.max(0, (scrollY - begin) / (finish - begin)))
            : 0
      )
    }
    updateRef.current = update
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    // Rolagem feita pela pessoa solta a trava do clique: roda/dedo na hora,
    // e qualquer outra (barra de rolagem, teclado) depois que a do clique terminou.
    const release = () => {
      settleUntilRef.current = 0
      if (lockedRef.current) {
        lockedRef.current = null
        schedule()
      }
    }
    const onScroll = () => {
      if (lockedRef.current && performance.now() > settleUntilRef.current)
        lockedRef.current = null
      schedule()
    }
    const onScrollEnd = () => {
      settleUntilRef.current = 0
    }
    // Avaliações e imagens carregam depois e empurram as seções.
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(document.body)
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("scrollend", onScrollEnd)
    window.addEventListener("resize", schedule)
    window.addEventListener("wheel", release, { passive: true })
    window.addEventListener("touchmove", release, { passive: true })
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("scrollend", onScrollEnd)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("wheel", release)
      window.removeEventListener("touchmove", release)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ids])

  // O realce mede o link ativo depois do layout (no celular só o ativo mostra
  // o rótulo, então a largura muda) e é escrito direto no DOM: um estado aqui
  // seria um segundo render só para mover um retângulo.
  useLayoutEffect(() => {
    const indicator = indicatorRef.current
    if (!indicator) return
    const link = active ? linkRefs.current.get(active) : null
    if (!link) {
      indicator.style.opacity = "0"
      return
    }
    // Na primeira aparição o realce surge no lugar, sem deslizar a partir da
    // esquerda.
    const appearing = indicator.style.opacity !== "1"
    if (appearing) indicator.style.transition = "none"
    indicator.style.left = `${link.offsetLeft}px`
    indicator.style.width = `${link.offsetWidth}px`
    indicator.style.opacity = "1"
    if (appearing) {
      void indicator.offsetWidth
      indicator.style.transition = ""
    }
    // No celular a lista rola de lado: traz a aba ativa para a vista sem
    // `scrollIntoView`, que rolaria a página junto.
    const list = indicator.parentElement
    if (list && list.scrollWidth > list.clientWidth) {
      list.scrollTo({
        left: link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2,
        behavior: "smooth",
      })
    }
  }, [active, ids])

  /**
   * Rola até a seção pela MESMA conta da linha de leitura (topo da cápsula
   * presa + altura dela + respiro), em vez de `scrollIntoView` com o
   * `scroll-margin` do CSS: as duas medidas divergiam por poucos pixels e a
   * seção parava logo abaixo da linha, sem acender a aba.
   */
  const scrollTo =
    (id: string | null, hash: string) => (event: React.MouseEvent) => {
      const nav = navRef.current
      const target = document.getElementById(hash)
      if (!nav || !target) return
      event.preventDefault()
      lockedRef.current = id
      settleUntilRef.current = performance.now() + 1200
      if (id) setActive(id)
      const offset =
        parseFloat(getComputedStyle(nav).top) + nav.offsetHeight + READING_GAP
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - offset,
        behavior: reduce ? "auto" : "smooth",
      })
      history.replaceState(null, "", `#${hash}`)
      updateRef.current()
    }

  return (
    <div ref={wrapperRef} className={className}>
      <nav
        ref={navRef}
        aria-label="Seções do produto"
        aria-hidden={gone || undefined}
        className={cn(
          "top-[calc(var(--sticky-header-h)+0.75rem)] w-fit max-w-full transition-[opacity,translate] duration-200 motion-reduce:transition-none",
          stuck ? "fixed z-30" : "static",
          gone && "pointer-events-none -translate-y-2 opacity-0"
        )}
      >
        <div
          className={cn(
            "relative flex items-center overflow-hidden rounded-full border bg-card/85 p-1 backdrop-blur-xl transition-[border-color,box-shadow] duration-300",
            stuck
              ? "border-white/10 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.9)]"
              : "border-border shadow-none"
          )}
        >
          {/* Miniatura: entra quando a cápsula gruda, e o produto já saiu da tela. */}
          <div
            aria-hidden
            className={cn(
              "shrink-0 overflow-hidden transition-[width,opacity,margin] duration-300 ease-out motion-reduce:transition-none",
              stuck && thumbUrl ? "mr-1 w-8 opacity-100" : "w-0 opacity-0"
            )}
          >
            {thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...storageImgProps(thumbUrl, 32)}
                alt=""
                title={productName}
                loading="lazy"
                className="size-8 rounded-full bg-muted object-cover"
              />
            )}
          </div>

          <ul className="relative flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span
              ref={indicatorRef}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 rounded-full bg-white/[0.08] opacity-0 transition-[left,width,opacity] duration-300 ease-out motion-reduce:transition-none"
            />
            {sections.map((section) => {
              const isActive = active === section.id
              const Icon = SECTION_ICON[section.id]
              return (
                // Estático de propósito: o realce mede `offsetLeft` do link contra
                // a <ul>. O link é `relative` para pintar por cima do realce.
                <li key={section.id} className="shrink-0">
                  <a
                    ref={(el) => {
                      if (el) linkRefs.current.set(section.id, el)
                      else linkRefs.current.delete(section.id)
                    }}
                    href={`#${section.id}`}
                    aria-current={isActive ? "location" : undefined}
                    aria-label={
                      section.count !== undefined
                        ? `${section.label} (${section.count})`
                        : section.label
                    }
                    onClick={scrollTo(section.id, section.id)}
                    className={cn(
                      "relative flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0 transition-colors",
                        isActive &&
                          (section.id === "avaliacoes"
                            ? "fill-amber-400 text-amber-400"
                            : "text-emerald-400")
                      )}
                      strokeWidth={2.2}
                    />
                    {/* No celular só o ativo mostra o rótulo: a cápsula cabe numa linha. */}
                    <span className={cn(!isActive && "hidden sm:inline")}>
                      {section.label}
                    </span>
                    {section.count !== undefined && (
                      <span
                        className={cn(
                          "min-w-[18px] rounded-full px-1.5 py-[3px] text-center text-[10.5px] leading-none font-bold tabular-nums",
                          section.count > 0
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-white/[0.06] text-muted-foreground"
                        )}
                      >
                        {section.count}
                      </span>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>

          {/* Atalho de volta ao bloco de compra, só com a cápsula presa. */}
          <a
            href={`#${backToId}`}
            onClick={scrollTo(null, backToId)}
            aria-label="Voltar à compra"
            title="Voltar à compra"
            tabIndex={stuck ? 0 : -1}
            aria-hidden={!stuck}
            className={cn(
              "flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-400/15 text-emerald-300 transition-[width,opacity,margin,background-color] duration-300 ease-out hover:bg-emerald-400/25 motion-reduce:transition-none",
              stuck
                ? "ml-1 w-8 opacity-100"
                : "pointer-events-none w-0 opacity-0"
            )}
          >
            <ArrowUp className="size-3.5 shrink-0" strokeWidth={2.4} />
          </a>

          {/* Progresso de leitura da parte de baixo da página. */}
          <span
            aria-hidden
            className="absolute inset-x-5 bottom-0 h-px origin-left bg-gradient-to-r from-emerald-400/0 via-emerald-400 to-emerald-300 transition-transform duration-150"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      </nav>
    </div>
  )
}

/** Respiro entre a cápsula presa e o título da seção ao rolar até ela. */
const READING_GAP = 24

/** Margem de rolagem das seções (link `#avaliacoes` do topo, URL com âncora): topo fixo + a cápsula + respiro. */
export const PRODUCT_SECTION_SCROLL_MARGIN =
  "scroll-mt-[calc(var(--sticky-header-h)+5rem)]"
