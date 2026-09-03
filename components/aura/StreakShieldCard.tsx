"use client"

import { useEffect, useState } from "react"
import { Loader2, Snowflake } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import type { StreakShieldVariant } from "@/lib/server/repositories/aura-store-repository"
import { PurchaseConfirmDialog } from "@/components/aura/PurchaseConfirmDialog"

interface StreakShieldCardProps {
  /** As duas variantes do catálogo (kind='streak_shield'), 1d e 3d. */
  variants: Partial<Record<StreakShieldVariant, AuraItem>>
  balance: number
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
  const canAfford = item ? balance >= item.auraCost : false

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
      onPurchased(selected, data.graceDays, item.auraCost)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao comprar a proteção"
      toast.error("Erro ao proteger", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-1",
        CARD_SURFACE_INTERACTIVE,
        shieldArmed && "border-sky-400/50"
      )}
    >
      {/* Arte "gelo": floco frio, sem animação — o oposto do foguinho da ofensiva. */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[var(--card-image-bg)]">
        <Snowflake
          className={cn(
            "size-[72px] text-sky-400",
            shieldArmed
              ? "drop-shadow-[0_0_10px_rgba(56,189,248,0.55)]"
              : "opacity-80"
          )}
          strokeWidth={1.15}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
        <h3 className="line-clamp-2 font-sans text-[13.5px] font-semibold leading-[1.35] tracking-normal text-foreground">
          Proteção de Ofensiva
        </h3>
        <p className="line-clamp-3 text-[10.5px] font-medium text-muted-foreground">
          Fica guardada até você precisar: se perder um dia de missões, sua ofensiva não zera.
        </p>

        <div className="mt-auto space-y-2">
          {shieldArmed ? (
            <div
              className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-300"
            >
              <span className="flex items-center gap-1.5">
                <Snowflake className="size-3.5" />
                Proteção guardada
              </span>
              <span className="text-[10px] font-medium opacity-70">
                {shieldGraceDays && shieldGraceDays > 1
                  ? `resgate em até ${shieldGraceDays} dias`
                  : "resgate no dia seguinte"}
              </span>
            </div>
          ) : (
            <>
              {/* Toggle Padrão / Margem estendida */}
              {available.length > 1 && (
                <div className="flex overflow-hidden rounded-lg border border-border text-[11px] font-bold">
                  {available.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => pick(v)}
                      className={cn(
                        "flex-1 px-2 py-1.5 transition-colors",
                        selected === v
                          ? "bg-sky-400/15 text-sky-300"
                          : "text-muted-foreground hover:bg-muted/40"
                      )}
                    >
                      {VARIANT_META[v].label}
                    </button>
                  ))}
                </div>
              )}

              <p className="font-display text-lg font-bold text-sky-300">
                🧊 {(item?.auraCost ?? 0).toLocaleString("pt-BR")}
              </p>

              <button
                type="button"
                onClick={() => {
                  if (!requireLogin() || !item) return
                  setConfirmOpen(true)
                }}
                disabled={loading || !canAfford || !item}
                title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                  canAfford
                    ? "bg-sky-500 text-[#04121c] hover:bg-sky-400"
                    : "cursor-not-allowed bg-muted/40 text-muted-foreground"
                )}
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                {canAfford ? "Guardar proteção" : "Saldo insuficiente"}
              </button>
            </>
          )}
        </div>
      </div>

      {item && (
        <PurchaseConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          itemName={`Proteção de Ofensiva (${VARIANT_META[selected].label})`}
          cost={item.auraCost}
          balance={balance}
          confirmLabel="Guardar proteção"
          loading={loading}
          onConfirm={handlePurchase}
        />
      )}
    </div>
  )
}
