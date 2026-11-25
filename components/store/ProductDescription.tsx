"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { FormattedText } from "@/components/ui/formatted-text"
import { cn } from "@/lib/utils"

// Altura da descrição recolhida. Texto que cabe nela aparece inteiro, sem botão.
const COLLAPSED_HEIGHT_PX = 280

export function ProductDescription({ text }: { text: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [fullHeight, setFullHeight] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setFullHeight(el.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  // Folga de ~2 linhas: não vale esconder só um pedacinho atrás do botão
  const overflows = fullHeight > COLLAPSED_HEIGHT_PX + 48
  const collapsed = overflows && !expanded

  return (
    <div>
      <div
        id="descricao-texto"
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{
          maxHeight: collapsed ? COLLAPSED_HEIGHT_PX : overflows ? fullHeight : undefined,
          // Esmaece o fim do texto recolhido sem depender da cor de fundo
          maskImage: collapsed ? "linear-gradient(to bottom, black 55%, transparent)" : undefined,
          WebkitMaskImage: collapsed ? "linear-gradient(to bottom, black 55%, transparent)" : undefined,
        }}
      >
        <div ref={contentRef} className="whitespace-pre-line text-[16px] leading-relaxed text-foreground/85">
          <FormattedText text={text} />
        </div>
      </div>

      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="descricao-texto"
          onClick={() => {
            if (expanded) {
              document.getElementById("descricao")?.scrollIntoView({ block: "start", behavior: "smooth" })
            }
            setExpanded((v) => !v)
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-1 text-[15px] font-semibold text-foreground transition-colors hover:text-foreground/70"
        >
          {expanded ? "Mostrar menos" : "Mostrar mais"}
          <ChevronDown className={cn("size-4 transition-transform duration-300", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  )
}
