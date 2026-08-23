"use client"

import { useState } from "react"
import { Crown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { formatVipPrice } from "@/lib/vip-plan"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"

interface VipMonthCardProps {
  item: AuraItem
  balance: number
  vipActive: boolean
  vipExpiresAt: string | null
  requireLogin: () => boolean
  onPurchased: (expiresAt: string | null) => void
  onShowBenefits?: () => void
}

function formatExpiresAt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function VipMonthCard({ item, balance, vipActive, vipExpiresAt, requireLogin, onPurchased, onShowBenefits }: VipMonthCardProps) {
  const [loading, setLoading] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const canAfford = balance >= item.auraCost

  async function handlePurchase() {
    if (!requireLogin()) return
    setLoading(true)
    try {
      const res = await fetch("/api/aura/vip/purchase", { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string; expiresAt?: string | null }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao comprar VIP")
      }
      toast.success("VIP ativado!", { description: "Válido por 1 mês." })
      onPurchased(data.expiresAt ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao comprar VIP"
      toast.error("Erro ao comprar VIP", { description: message })
    } finally {
      setLoading(false)
    }
  }

  async function handleSubscribe() {
    if (!requireLogin()) return
    setSubscribing(true)
    try {
      const res = await fetch("/api/vip/subscribe", { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string; checkoutUrl?: string }
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? "Erro ao iniciar assinatura")
      }
      window.location.href = data.checkoutUrl
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao iniciar assinatura"
      toast.error("Erro ao assinar VIP", { description: message })
      setSubscribing(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-1",
        CARD_SURFACE_INTERACTIVE,
        vipActive && "border-[var(--vip-accent-soft)]"
      )}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[var(--card-image-bg)]">
        <Crown className="size-[72px]" style={{ color: "var(--vip-accent-soft)" }} strokeWidth={1.15} />
      </div>

      <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
        <h3 className="line-clamp-2 font-sans text-[13.5px] font-semibold leading-[1.35] tracking-normal text-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-2 text-[10.5px] font-medium text-muted-foreground">{item.description}</p>
        )}
        {onShowBenefits && (
          <button
            type="button"
            onClick={onShowBenefits}
            className="self-start text-[10.5px] font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--vip-accent)" }}
          >
            Ver todas as vantagens
          </button>
        )}

        <div className="mt-auto space-y-2">
          <p className="font-display text-lg font-bold text-orange-400">🔥 {item.auraCost.toLocaleString("pt-BR")}</p>

          {vipActive ? (
            <div
              className="flex w-full flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-xs font-bold"
              style={{ borderColor: "var(--vip-accent-soft)", backgroundColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
            >
              <span className="flex items-center gap-1.5">
                <Crown className="size-3.5" />
                Você já é VIP
              </span>
              {vipExpiresAt && (
                <span className="text-[10px] font-medium opacity-70">até {formatExpiresAt(vipExpiresAt)}</span>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handlePurchase}
                disabled={loading || subscribing || !canAfford}
                title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                  canAfford
                    ? "text-black hover:opacity-90"
                    : "cursor-not-allowed bg-muted/40 text-muted-foreground"
                )}
                style={canAfford ? { backgroundColor: "var(--vip-accent)" } : undefined}
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                {canAfford ? "Ativar com Aura" : "Saldo insuficiente"}
              </button>

              <button
                type="button"
                onClick={handleSubscribe}
                disabled={loading || subscribing}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-[var(--vip-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
              >
                {subscribing && <Loader2 className="size-3.5 animate-spin" />}
                Assinar por {formatVipPrice()}/mês
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
