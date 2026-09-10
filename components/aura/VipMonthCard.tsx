"use client"

import { useState } from "react"
import Link from "next/link"
import { Crown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { formatVipPrice } from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import { PurchaseConfirmDialog } from "@/components/aura/PurchaseConfirmDialog"

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const canAfford = balance >= item.auraCost
  const subscriptionEnabled = isVipSubscriptionEnabled()

  async function handlePurchase() {
    setLoading(true)
    try {
      const res = await fetch("/api/aura/vip/purchase", { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string; expiresAt?: string | null }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao comprar VIP")
      }
      toast.success("VIP ativado!", { description: "Válido por 1 mês." })
      setConfirmOpen(false)
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
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        checkoutUrl?: string
        manageUrl?: string | null
      }
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        // Assinatura já viva na Asaas — oferece o caminho de gerenciamento
        // em vez de um erro sem saída.
        if (data.manageUrl) {
          toast.error("Você já tem uma assinatura", {
            description: data.error ?? "Gerencie sua assinatura nas configurações da conta.",
            action: {
              label: "Gerenciar",
              onClick: () => {
                window.location.href = data.manageUrl as string
              },
            },
          })
          setSubscribing(false)
          return
        }
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
        "flex flex-col overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-1",
        CARD_SURFACE_INTERACTIVE,
        vipActive && "border-[var(--vip-accent-soft)]"
      )}
    >
      <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden bg-[var(--card-image-bg)]">
        <Crown className="size-11" style={{ color: "var(--vip-accent-soft)" }} strokeWidth={1.15} />
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3 pb-2.5 pt-2">
        <h3 className="line-clamp-1 font-sans text-[12px] font-semibold leading-tight tracking-normal text-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-2 text-[9.5px] font-medium leading-snug text-muted-foreground">{item.description}</p>
        )}
        {onShowBenefits && (
          <button
            type="button"
            onClick={onShowBenefits}
            className="self-start text-[9.5px] font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--vip-accent)" }}
          >
            Ver todas as vantagens
          </button>
        )}

        <div className="mt-auto space-y-1.5 pt-1">
          <p className="font-display text-[15px] font-bold text-orange-400">🔥 {item.auraCost.toLocaleString("pt-BR")}</p>

          {vipActive ? (
            // VIP ativo: nem "Ativar com Aura" nem "Assinar" servem aqui — a RPC
            // e o POST recusam quem já tem acesso. Mas o selo sozinho era um
            // beco sem saída para quem cancelou a assinatura e ainda está
            // usando o período pago: a aba Assinatura é o único lugar que
            // conhece esse estado e sabe oferecer a reassinatura, então o card
            // aponta para lá em vez de terminar a conversa.
            <div className="space-y-1.5">
              <div
                className="flex w-full flex-col items-center gap-0.5 rounded-lg border px-3 py-1.5 text-[10.5px] font-bold"
                style={{ borderColor: "var(--vip-accent-soft)", backgroundColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
              >
                <span className="flex items-center gap-1.5">
                  <Crown className="size-3" />
                  Você já é VIP
                </span>
                {vipExpiresAt && (
                  <span className="text-[9px] font-medium opacity-70">até {formatExpiresAt(vipExpiresAt)}</span>
                )}
              </div>
              <Link
                href="/conta#assinatura"
                className="block text-center text-[9.5px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
              >
                Gerenciar assinatura
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  if (!requireLogin()) return
                  setConfirmOpen(true)
                }}
                disabled={loading || subscribing || !canAfford}
                title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[10.5px] font-bold transition-colors",
                  canAfford
                    ? "text-black hover:opacity-90"
                    : "cursor-not-allowed bg-muted/40 text-muted-foreground"
                )}
                style={canAfford ? { backgroundColor: "var(--vip-accent)" } : undefined}
              >
                {loading && <Loader2 className="size-3 animate-spin" />}
                {canAfford ? "Ativar com Aura" : "Saldo insuficiente"}
              </button>

              {subscriptionEnabled && (
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={loading || subscribing}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10.5px] font-bold transition-colors hover:bg-[var(--vip-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
                >
                  {subscribing && <Loader2 className="size-3 animate-spin" />}
                  Assinar por {formatVipPrice()}/mês
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <PurchaseConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        itemName={item.name}
        listPrice={item.auraCost}
        // Sem desconto aqui de propósito: `purchase_vip_with_aura` recusa
        // quem já é VIP ativo (`vip_already_active`), então nunca há um VIP
        // comprando este item — exibir "−10%" prometeria um preço que a RPC
        // não chegaria a cobrar. Ver a migration do desconto.
        isVip={false}
        balance={balance}
        confirmLabel="Ativar VIP"
        loading={loading}
        onConfirm={handlePurchase}
      />
    </div>
  )
}
