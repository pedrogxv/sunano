"use client"

import { RouteLink } from "@/components/ui/route-link"
import { useEffect, useState } from "react"
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

  useEffect(() => {
    if (!latest) return
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === latest.version)
    } catch {
      setDismissed(false)
    }
  }, [latest])

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
      {/* Fora da pilha sticky: abre o topo da superfície do conteúdo, logo
          abaixo da ilha da TopBar, e rola com a página. Grudado, somava uma
          altura variável a `--sticky-header-h` (medida por ResizeObserver a
          cada mudança) e roubava uma faixa da tela em toda rolagem. */}
      <div
        className="changelog-banner flex items-center gap-3 border-b border-border bg-card px-4 py-2 text-xs sm:text-sm"
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
