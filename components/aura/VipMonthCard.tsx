"use client"

import { useState } from "react"
import Link from "next/link"
import { Crown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { formatVipPrice } from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import { AuraPerkCard, PerkAction, PerkStatus, perkLinkClass } from "@/components/aura/AuraPerkCard"
import { AuraPriceTag } from "@/components/aura/AuraPriceTag"
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
        code?: string
        checkoutUrl?: string
        manageUrl?: string | null
      }
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        // Assinatura já viva na Asaas — oferece o caminho de gerenciamento
        // em vez de um erro sem saída.
        if (data.manageUrl) {
          // Um checkout em aberto ainda não é assinatura: o id na Asaas só
          // nasce no 1º pagamento. Ver POST /api/vip/subscribe.
          const isPendingCheckout = data.code === "subscription_already_pending"
          toast.error(isPendingCheckout ? "Pagamento pendente" : "Você já tem uma assinatura", {
            description: data.error ?? "Gerencie sua assinatura nas configurações da conta.",
            action: {
              label: isPendingCheckout ? "Ver checkout" : "Gerenciar",
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
    <AuraPerkCard
      accent="vip"
      icon={<Crown strokeWidth={1.5} />}
      title={item.name}
      description={item.description}
      active={vipActive}
      extra={
        // As ações secundárias moram aqui, não no rodapé: o rodapé de toda
        // vantagem é preço + UMA ação, senão este card sai mais alto e
        // desalinha os vizinhos.
        <div className="flex flex-col items-start gap-1">
          {onShowBenefits && (
            <button type="button" onClick={onShowBenefits} className={perkLinkClass("vip")}>
              Ver todas as vantagens
            </button>
          )}
          {vipActive ? (
            // VIP ativo: nem "Ativar com Aura" nem "Assinar" servem aqui — a RPC
            // e o POST recusam quem já tem acesso. Mas o selo sozinho era um
            // beco sem saída para quem cancelou a assinatura e ainda está
            // usando o período pago: a aba Assinatura é o único lugar que
            // conhece esse estado e sabe oferecer a reassinatura, então o card
            // aponta para lá em vez de terminar a conversa.
            <Link href="/conta#assinatura" className={perkLinkClass("vip", "text-muted-foreground")}>
              Gerenciar assinatura
            </Link>
          ) : (
            subscriptionEnabled && (
              <button
                type="button"
                // Abre o modal em vez de disparar o POST direto QUANDO há
                // handler: existem dois planos (mensal e anual) e só o modal
                // deixa escolher. O POST direto continua como fallback — ele
                // assina no MENSAL, que é o preço que este botão anuncia.
                onClick={onShowBenefits ?? handleSubscribe}
                disabled={loading || subscribing}
                className={perkLinkClass("vip", "flex items-center gap-1 text-muted-foreground")}
              >
                {subscribing && <Loader2 className="size-3 animate-spin" />}
                ou assine a partir de {formatVipPrice("monthly")}/mês
              </button>
            )
          )}
        </div>
      }
      // Sem desconto VIP no preço: quem já é VIP não compra este item (ver o
      // diálogo abaixo), e quem compra nunca tem o desconto.
      price={vipActive ? undefined : <AuraPriceTag listPrice={item.auraCost} isVip={false} />}
      action={
        vipActive ? (
          <PerkStatus
            accent="vip"
            icon={<Crown />}
            label="Você já é VIP"
            detail={vipExpiresAt ? `até ${formatExpiresAt(vipExpiresAt)}` : null}
          />
        ) : (
          <PerkAction
            accent="vip"
            label="Ativar com Aura"
            canAfford={canAfford}
            loading={loading}
            disabled={subscribing}
            onClick={() => {
              if (!requireLogin()) return
              setConfirmOpen(true)
            }}
          />
        )
      }
    >
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
    </AuraPerkCard>
  )
}
