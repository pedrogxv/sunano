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
    /* Aba que SAI da ilha do topo: encosta na borda de baixo do vidro, com o
       mesmo material e borda, sem a de cima e com cantos só embaixo — lê como
       parte da barra, não como uma faixa a mais no conteúdo. Vive no
       `overlay` do TopBarDock, então gruda junto. Altura FIXA (`h-8`): a
       `--sticky-header-h` soma 2rem enquanto ela existe (globals.css), sem
       medir nada em JS. No desktop começa depois do canto côncavo da fusão
       com a sidebar (24px), não em cima dele. */
    <div className="changelog-banner mx-3 flex h-8 items-center gap-2 rounded-b-xl border border-t-0 border-white/10 bg-[rgb(18_18_20/0.92)] bg-gradient-to-b from-black/40 to-white/[0.03] pl-3 pr-1 text-xs backdrop-blur-xl md:ml-8 md:mr-4">
      <Sparkles className="size-3.5 shrink-0 text-[#b4b4b4]" />
      <p className="line-clamp-1 min-w-0 flex-1 text-[#b4b4b4]">
        <span className="font-semibold text-white">{t.changelogBanner.newLabel.replace("{version}", latest.version)}</span>{" "}
        {latest.title}
      </p>
      <RouteLink
        href="/changelog"
        className="shrink-0 rounded-full px-2 py-0.5 font-medium text-white transition-colors hover:bg-white/[0.06]"
      >
        {t.changelogBanner.viewHistory}
      </RouteLink>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.changelogBanner.close}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[#b4b4b4] transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
