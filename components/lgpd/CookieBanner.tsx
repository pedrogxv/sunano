"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "sunano_cookie_consent"
const CONSENT_VERSION = "2026-06"

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored || JSON.parse(stored).version !== CONSENT_VERSION) {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [])

  function accept() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString() })
      )
    } catch {
      // localStorage pode estar indisponível em alguns ambientes
    }
    setVisible(false)
  }

  function dismiss() {
    setVisible(false)
  }

  if (!visible) return null

  // O padding inferior soma env(safe-area-inset-bottom): sem isso os botões ficam
  // sob o indicador de home do iOS quando a barra está colada no rodapé.
  // Barra fina de uma linha — o texto completo já vive em /privacidade.
  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies e privacidade"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-3 py-2.5 pb-[calc(0.625rem_+_env(safe-area-inset-bottom))] shadow-lg backdrop-blur-sm md:inset-x-auto md:bottom-4 md:left-4 md:max-w-sm md:rounded-xl md:border md:pb-2.5"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-foreground">
          Usamos cookies essenciais.{" "}
          <Link
            href="/privacidade"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Saiba mais
          </Link>
        </p>
        <Button size="sm" onClick={accept} className="h-9 shrink-0 px-3 text-xs md:h-8">
          Entendido
        </Button>
        <button
          onClick={dismiss}
          aria-label="Fechar aviso de cookies"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground md:size-8"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
