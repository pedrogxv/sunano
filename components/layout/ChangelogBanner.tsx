"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"

import { useT } from "@/lib/use-t"

const STORAGE_KEY = "sunano_changelog_banner_dismissed"

export function ChangelogBanner() {
  const t = useT()
  const latest = t.changelog.entries[0]
  const [dismissed, setDismissed] = useState(true)

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
    <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-4 py-2 text-xs sm:text-sm">
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
