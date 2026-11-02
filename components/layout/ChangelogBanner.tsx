"use client"

import { RouteLink } from "@/components/ui/route-link"
import { useEffect, useRef, useState } from "react"
import { Sparkles, X } from "lucide-react"

import { CHANGELOG_BANNER_STORAGE_KEY as STORAGE_KEY } from "@/lib/changelog-banner"
import { useT } from "@/lib/use-t"

/**
 * Quem abriu as Patch Notes já viu a novidade: grava a versão como dispensada
 * e esconde o aviso na hora pelo mesmo atributo do script abaixo (o CSS o
 * tira da tela sem esperar o banner remontar).
 */
export function markChangelogBannerSeen(version: string) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // localStorage pode estar indisponível em alguns ambientes
  }
  document.documentElement.setAttribute("data-changelog-dismissed", "")
}

export function ChangelogBanner() {
  const t = useT()
  const latest = t.changelog.entries[0]
  // Começa VISÍVEL (igual ao HTML do servidor); quem já dispensou é escondido
  // antes de pintar pelo script do <head> (`changelogBannerProbeScript`, em
  // app/layout.tsx), e o efeito abaixo só tira do DOM.
  const [dismissed, setDismissed] = useState(false)
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
      // Escondido pelo CSS (já dispensado, antes do efeito tirá-lo do DOM):
      // altura 0 viraria `--sticky-header-h: 0px`; fica o padrão de globals.css.
      if (el.getClientRects().length === 0) {
        document.documentElement.style.removeProperty("--sticky-header-h")
        return
      }
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
    <>
      <div
        ref={ref}
        className="changelog-banner sticky top-16 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-2 text-xs sm:text-sm"
      >
        <Sparkles className="size-4 shrink-0 text-primary" />
        <p className="line-clamp-1 min-w-0 flex-1 text-foreground">
          <span className="font-semibold">{t.changelogBanner.newLabel.replace("{version}", latest.version)}</span>{" "}
          <span className="text-muted-foreground">{latest.title}</span>
        </p>
        <RouteLink
          href="/changelog"
          className="shrink-0 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {t.changelogBanner.viewHistory}
        </RouteLink>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.changelogBanner.close}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </>
  )
}
