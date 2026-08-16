"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Sparkles, X } from "lucide-react"

import { useT } from "@/lib/use-t"

const STORAGE_KEY = "sunano_changelog_banner_dismissed"

export function ChangelogBanner() {
  const t = useT()
  const latest = t.changelog.entries[0]
  const [dismissed, setDismissed] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!latest) return
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === latest.version)
    } catch {
      setDismissed(false)
    }
  }, [latest])

  // Siblings sticky abaixo do header (sidebars de filtro/fórum) precisam saber
  // quanto o banner soma à TopBar pra não ficarem escondidos atrás dele. A
  // altura varia com o conteúdo/viewport, então medimos em vez de fixar um valor.
  useEffect(() => {
    const el = ref.current
    if (!el) {
      document.documentElement.style.removeProperty("--sticky-header-h")
      return
    }
    const update = () => {
      document.documentElement.style.setProperty(
        "--sticky-header-h",
        `${el.getBoundingClientRect().bottom}px`
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty("--sticky-header-h")
    }
  }, [dismissed, latest])

  if (!latest || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, latest.version)
    } catch {
      // localStorage pode estar indisponível em alguns ambientes
    }
    setDismissed(true)
  }

  return (
    <div
      ref={ref}
      className="sticky top-16 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-2 text-xs sm:text-sm"
    >
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate text-foreground">
        <span className="font-semibold">Novidade ({latest.version}):</span>{" "}
        <span className="text-muted-foreground">{latest.title}</span>
      </p>
      <Link
        href="/changelog"
        className="shrink-0 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
      >
        Ver histórico de mudanças
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar aviso"
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
