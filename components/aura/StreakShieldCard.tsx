"use client"

import { useEffect, useState } from "react"
import { Snowflake } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import type { StreakShieldVariant } from "@/lib/server/repositories/aura-store-repository"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { AuraPerkCard, PerkAction, PerkStatus } from "@/components/aura/AuraPerkCard"
import { AuraPriceTag } from "@/components/aura/AuraPriceTag"
import { PurchaseConfirmDialog } from "@/components/aura/PurchaseConfirmDialog"

interface StreakShieldCardProps {
  /** As duas variantes do catálogo (kind='streak_shield'), 1d e 3d. */
  variants: Partial<Record<StreakShieldVariant, AuraItem>>
  balance: number
  /** VIP ativo agora — 10% off, mesma regra do resto da Central de Aura. */
  isVip: boolean
  /** Já tem um escudo guardado: enquanto true, o card NÃO mostra opção de comprar. */
  shieldArmed: boolean
  /** Margem de atraso do escudo guardado (1 ou 3). */
  shieldGraceDays: number | null
  requireLogin: () => boolean
  onPurchased: (variant: StreakShieldVariant, graceDays: number, cost: number) => void
}

const VARIANT_META: Record<StreakShieldVariant, { label: string }> = {
  "1d": { label: "1 dia" },
  "3d": { label: "3 dias" },
}

const LAST_PICK_KEY = "aura:streak-shield:last-variant"

export function StreakShieldCard({
  variants,
  balance,
  isVip,
  shieldArmed,
  shieldGraceDays,
  requireLogin,
  onPurchased,
}: StreakShieldCardProps) {
  const available = (Object.keys(VARIANT_META) as StreakShieldVariant[]).filter((v) => variants[v])
  const [selected, setSelected] = useState<StreakShieldVariant>(available[0] ?? "1d")
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Lembra a última escolha entre visitas (só conveniência — try/catch porque
  // localStorage pode lançar em janela privada / storage bloqueado).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PICK_KEY)
      if (saved === "1d" || saved === "3d") {
        if (variants[saved]) setSelected(saved)
      }
    } catch {
      /* ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = variants[selected]
  // Preço com desconto também no afford: um VIP com saldo entre o preço
  // cheio e o com desconto conseguia comprar mas via "Saldo insuficiente".
  const price = item ? auraPriceForVip(item.auraCost, isVip) : null
  const canAfford = price ? balance >= price.finalPrice : false

  function pick(v: StreakShieldVariant) {
    setSelected(v)
    try {
      localStorage.setItem(LAST_PICK_KEY, v)
    } catch {
      /* ignora */
    }
  }

  async function handlePurchase() {
    if (!item) return
    setLoading(true)
    try {
      const res = await fetch("/api/aura/streak-shield/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant: selected }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; graceDays?: number }
      if (!res.ok || !data.ok || typeof data.graceDays !== "number") {
        throw new Error(data.error ?? "Erro ao comprar a proteção")
      }
      toast.success("Proteção guardada!", {
        description:
          data.graceDays > 1
            ? `Se perder um dia de missões, você tem ${data.graceDays} dias para voltar e resgatar a ofensiva.`
            : "Se perder um dia de missões, volte no dia seguinte para resgatar a ofensiva.",
      })
      setConfirmOpen(false)
      onPurchased(selected, data.graceDays, price?.finalPrice ?? item.auraCost)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao comprar a proteção"
      toast.error("Erro ao proteger", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuraPerkCard
      accent="sky"
      // Arte "gelo": floco frio, sem animação — o oposto do foguinho da ofensiva.
      icon={<Snowflake strokeWidth={1.5} />}
      title="Proteção de Ofensiva"
      description="Fica guardada até você precisar: se perder um dia de missões, sua ofensiva não zera."
      active={shieldArmed}
      extra={
        // Toggle Padrão / Margem estendida
        !shieldArmed && available.length > 1 ? (
          <div className="flex overflow-hidden rounded-lg border border-border text-[11px] font-bold">
            {available.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => pick(v)}
                className={cn(
                  "flex-1 px-2 py-1 transition-colors",
                  selected === v ? "bg-sky-400/15 text-sky-300" : "text-muted-foreground hover:bg-muted/40"
                )}
              >
                {VARIANT_META[v].label}
              </button>
            ))}
          </div>
        ) : undefined
      }
      price={
        shieldArmed ? undefined : (
          <AuraPriceTag listPrice={item?.auraCost ?? 0} isVip={isVip} icon="🧊" priceClassName="text-sky-300" />
        )
      }
      action={
        shieldArmed ? (
          <PerkStatus
            accent="sky"
            icon={<Snowflake />}
            label="Proteção guardada"
            detail={
              shieldGraceDays && shieldGraceDays > 1 ? `resgate em até ${shieldGraceDays} dias` : "resgate no dia seguinte"
            }
          />
        ) : (
          <PerkAction
            accent="sky"
            label="Guardar proteção"
            canAfford={canAfford}
            loading={loading}
            disabled={!item}
            onClick={() => {
              if (!requireLogin() || !item) return
              setConfirmOpen(true)
            }}
          />
        )
      }
    >
      {item && (
        <PurchaseConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          itemName={`Proteção de Ofensiva (${VARIANT_META[selected].label})`}
          listPrice={item.auraCost}
          isVip={isVip}
          balance={balance}
          confirmLabel="Guardar proteção"
          loading={loading}
          onConfirm={handlePurchase}
        />
      )}
    </AuraPerkCard>
  )
}
