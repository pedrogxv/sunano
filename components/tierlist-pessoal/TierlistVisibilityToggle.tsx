"use client"

import { useState } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"

/**
 * Botão de "ocultar / mostrar a minha tierlist".
 *
 * Aparece pra qualquer dono que já tenha uma tierlist — com ou sem VIP. É de
 * propósito que não dependa de VIP: quem deixou o VIP expirar não consegue
 * mais editar, mas a tierlist dele continua congelada e pública; este botão é
 * a única forma de tirá-la do ar.
 *
 * Oculta = some de `/tierlist/comunidade`, do link "Ver tierlist" no perfil e
 * da página pública `/perfil/[handle]/tierlist` para visitantes. O dono
 * continua vendo o próprio board.
 */
export function TierlistVisibilityToggle({ initialHidden }: { initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !hidden
    setHidden(next)
    setSaving(true)
    try {
      const res = await fetch("/api/perfil/tierlist/visibilidade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: next }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setHidden(!next)
        toast.error(data?.error ?? "Não foi possível salvar.")
        return
      }
      toast.success(next ? "Tierlist ocultada." : "Tierlist visível de novo.")
    } catch {
      setHidden(!next)
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border p-3",
        CARD_SURFACE
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {hidden ? (
          <EyeOff className="mt-0.5 size-4 shrink-0 text-amber-500" />
        ) : (
          <Eye className="mt-0.5 size-4 shrink-0" style={{ color: "var(--vip-accent)" }} />
        )}
        <p className="min-w-0 text-xs text-muted-foreground">
          {hidden
            ? "Sua tierlist está oculta: ninguém mais a vê na comunidade nem pelo seu perfil. Você continua vendo aqui."
            : "Sua tierlist está visível na comunidade e no seu perfil."}
        </p>
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
          hidden
            ? "border-[var(--vip-accent)]/40 text-[var(--vip-accent)] hover:bg-[var(--vip-accent)]/10"
            : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : hidden ? (
          <Eye className="size-3.5" />
        ) : (
          <EyeOff className="size-3.5" />
        )}
        {hidden ? "Tornar visível" : "Ocultar tierlist"}
      </button>
    </div>
  )
}
