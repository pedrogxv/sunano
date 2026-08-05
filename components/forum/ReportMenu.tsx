"use client"

import { useState } from "react"
import { Flag, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Menu "..." com a opção de denunciar um post ou comentário do fórum.
 * Denúncia é direta (um clique, sem motivo) — a fila de moderação prioriza
 * pelo volume, não por justificativa.
 */
export function ReportMenu({
  postSlug,
  targetType,
  commentId,
}: {
  postSlug: string
  targetType: "post" | "comment"
  commentId?: string
}) {
  const [reported, setReported] = useState(false)

  async function handleReport() {
    try {
      const res = await fetch("/api/forum/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, postSlug, commentId: commentId ?? null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 401) {
          toast.error("Entre na sua conta para denunciar.")
        } else {
          toast.error(data?.error ?? "Erro ao denunciar")
        }
        return
      }
      setReported(true)
      toast.success("Denúncia enviada. Obrigado por ajudar a moderar o fórum.")
    } catch {
      toast.error("Erro ao denunciar")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label="Mais opções"
          className="flex items-center justify-center rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 border-border bg-popover text-foreground shadow-xl">
        <DropdownMenuItem
          onSelect={handleReport}
          disabled={reported}
          className="gap-2.5 text-destructive focus:text-destructive"
        >
          <Flag className="size-4" />
          {reported ? "Denunciado" : "Denunciar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
