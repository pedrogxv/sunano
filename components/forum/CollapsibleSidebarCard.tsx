"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

const STORAGE_PREFIX = "forum-sidebar-collapsed:"

/**
 * Card recolhível das sidebars do fórum: o cabeçalho inteiro é o botão de
 * toggle e o estado fica no `localStorage` por seção, então quem fecha
 * "Regras do Fórum" continua com ele fechado na próxima visita.
 *
 * O `id` é a chave de persistência — precisa ser único entre todos os cards
 * que podem aparecer juntos na mesma tela.
 */
export function CollapsibleSidebarCard({
  id,
  header,
  children,
  className,
  defaultOpen = true,
}: {
  id: string
  header: React.ReactNode
  children: React.ReactNode
  /** Sobrescreve o arredondamento/superfície padrão do card. */
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  // Lido só depois da montagem pra não divergir do HTML do servidor.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_PREFIX + id)
      if (stored !== null) setOpen(stored === "1")
    } catch {
      /* localStorage indisponível (modo privado) — mantém o padrão */
    }
  }, [id])

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, next ? "1" : "0")
      } catch {
        /* ignora */
      }
      return next
    })
  }

  return (
    <section className={cn("rounded-xl border", CARD_SURFACE, className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-[inherit] px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <span className="min-w-0 flex-1">{header}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
