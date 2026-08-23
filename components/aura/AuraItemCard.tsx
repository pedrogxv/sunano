"use client"

import { useState } from "react"
import { Check, Loader2, Shirt, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"

interface AuraItemCardProps {
  item: AuraItem
  balance: number
  owned: boolean
  equipped: boolean
  requireLogin: () => boolean
  onRedeemed: () => void
  onEquipChange: (nextEquippedId: string | null) => void
}

export function AuraItemCard({ item, balance, owned, equipped, requireLogin, onRedeemed, onEquipChange }: AuraItemCardProps) {
  const [loading, setLoading] = useState(false)
  const canAfford = balance >= item.auraCost

  async function handleRedeem() {
    if (!requireLogin()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/aura/items/${item.id}/redeem`, { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao resgatar item")
      }
      toast.success("Item resgatado!", { description: item.name })
      onRedeemed()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao resgatar item"
      toast.error("Erro ao resgatar", { description: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleEquip() {
    if (!requireLogin()) return
    setLoading(true)
    try {
      const url = equipped ? "/api/aura/items/unequip" : `/api/aura/items/${item.id}/equip`
      const res = await fetch(url, { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao equipar item")
      }
      onEquipChange(equipped ? null : item.id)
      toast.success(equipped ? "Moldura removida" : "Moldura equipada", { description: item.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao equipar item"
      toast.error("Erro ao equipar", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-1",
        CARD_SURFACE_INTERACTIVE,
        equipped && "event-card-glow border-orange-500/50"
      )}
      style={equipped ? ({ "--glow-color": "oklch(0.7 0.2 40 / 0.5)" } as React.CSSProperties) : undefined}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--card-image-bg)]">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-4" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="size-[72px] text-orange-500/50" strokeWidth={1.15} />
          </div>
        )}

        {owned && (
          <span className="absolute left-2.5 top-2.5 z-[1] flex items-center gap-1 rounded-lg bg-emerald-500/90 px-2 py-1 text-[10px] font-bold text-[#04140d]">
            <Check className="size-2.5" strokeWidth={2.5} />
            Possui
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
        <h3 className="line-clamp-2 font-sans text-[13.5px] font-semibold leading-[1.35] tracking-normal text-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-2 text-[10.5px] font-medium text-muted-foreground">{item.description}</p>
        )}

        <div className="mt-auto space-y-2">
          <p className="font-display text-lg font-bold text-orange-400">🔥 {item.auraCost.toLocaleString("pt-BR")}</p>

          {owned ? (
            <button
              type="button"
              onClick={handleToggleEquip}
              disabled={loading}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                equipped
                  ? "border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                  : "border border-border text-foreground hover:border-[#3a3a3a] hover:bg-muted/40"
              )}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Shirt className="size-3.5" />
              )}
              {equipped ? "Equipado" : "Equipar"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRedeem}
              disabled={loading || !canAfford}
              title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                canAfford
                  ? "bg-orange-500 text-[#1a1200] hover:bg-orange-400"
                  : "cursor-not-allowed bg-muted/40 text-muted-foreground"
              )}
            >
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              {canAfford ? "Resgatar" : "Saldo insuficiente"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
