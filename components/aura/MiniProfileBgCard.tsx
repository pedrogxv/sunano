"use client"

import { useState } from "react"
import { Check, Loader2, Shirt, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { AuraPriceTag } from "@/components/aura/AuraPriceTag"
import { PurchaseConfirmDialog } from "@/components/aura/PurchaseConfirmDialog"
import {
  MINI_PROFILE_BG_TIER_ACCENT,
  MINI_PROFILE_BG_TIER_LABEL,
  type MiniProfileBgTheme,
} from "@/lib/mini-profile-backgrounds"
import {
  MiniProfileBackground,
  miniProfileBgBorderClass,
  miniProfileBgVars,
} from "@/components/profile/MiniProfileBackground"

interface MiniProfileBgCardProps {
  item: AuraItem
  theme: MiniProfileBgTheme
  balance: number
  /** VIP ativo agora — desconta 10% do preço exibido (a RPC desconta o real). */
  isVip: boolean
  owned: boolean
  equipped: boolean
  requireLogin: () => boolean
  onRedeemed: (cost: number) => void
  onEquipChange: (nextEquippedId: string | null) => void
}

/**
 * Card de um Fundo de Mini Perfil na loja da Central de Aura.
 *
 * A "imagem" do item é o próprio efeito rodando: em vez de um PNG de preview
 * (que nunca mostraria a animação, que é o produto), o card renderiza o tema
 * real no tamanho do cartão. O que o usuário vê aqui é literalmente o que vai
 * aparecer no hover do avatar dele.
 *
 * Compra e equipar reaproveitam o caminho já existente:
 * `POST /api/aura/items/[id]/redeem` (mesma RPC de qualquer item do catálogo)
 * e `POST /api/aura/mini-profile-bg/...` para o slot próprio de fundo.
 */
export function MiniProfileBgCard({
  item,
  theme,
  balance,
  isVip,
  owned,
  equipped,
  requireLogin,
  onRedeemed,
  onEquipChange,
}: MiniProfileBgCardProps) {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const price = auraPriceForVip(item.auraCost, isVip)
  const canAfford = balance >= price.finalPrice
  const tierAccent = MINI_PROFILE_BG_TIER_ACCENT[theme.tier]

  async function handleRedeem() {
    setLoading(true)
    try {
      const res = await fetch(`/api/aura/items/${item.id}/redeem`, { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao resgatar item")
      }
      toast.success("Fundo desbloqueado!", { description: theme.name })
      setConfirmOpen(false)
      onRedeemed(price.finalPrice)
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
      const url = equipped
        ? "/api/aura/mini-profile-bg/unequip"
        : `/api/aura/mini-profile-bg/${item.id}/equip`
      const res = await fetch(url, { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao equipar o fundo")
      }
      onEquipChange(equipped ? null : item.id)
      toast.success(equipped ? "Fundo removido" : "Fundo equipado", { description: theme.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao equipar o fundo"
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
        equipped && "border-emerald-400/50"
      )}
    >
      {/* Preview vivo: o efeito rodando no formato do cartão de Mini Perfil.
          A borda animada do tema mora neste wrapper (é dele o raio de onde o
          halo escapa); as camadas ficam recortadas dentro. */}
      <div className="p-2.5 pb-0">
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden rounded-xl",
            miniProfileBgBorderClass(theme)
          )}
          style={miniProfileBgVars(theme)}
        >
          <MiniProfileBackground theme={theme} />

          {/* Silhueta de um mini perfil por cima, pra leitura de "isto é o
              fundo do SEU cartão" — sem nome/foto reais, que aqui só seriam
              ruído. */}
          <div className="relative z-[1] flex h-full flex-col items-center justify-center gap-1.5">
            <span className="size-9 rounded-full border-2 border-white/70 bg-white/15 backdrop-blur-[2px]" />
            <span className="h-1.5 w-14 rounded-full bg-white/70" />
            <span className="h-1 w-10 rounded-full bg-white/40" />
          </div>

          <span
            className="absolute left-2 top-2 z-[2] rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-black/85 backdrop-blur-[2px]"
            style={{ backgroundColor: tierAccent }}
          >
            {MINI_PROFILE_BG_TIER_LABEL[theme.tier]}
          </span>

          {owned && (
            <span className="absolute right-2 top-2 z-[2] flex items-center gap-1 rounded-lg bg-emerald-500/90 px-2 py-1 text-[10px] font-bold text-[#04140d]">
              <Check className="size-2.5" strokeWidth={2.5} />
              Possui
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3">
        <h3 className="line-clamp-1 font-sans text-[13.5px] font-semibold leading-[1.35] text-foreground">
          {theme.name}
        </h3>
        <p className="line-clamp-2 text-[10.5px] font-medium text-muted-foreground">
          {theme.description}
        </p>

        {/* Quais camadas o preço compra — o "quanto mais caro, mais efeito"
            explicitado em vez de deixado por conta do olho. */}
        <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/80">
          <Sparkles className="size-2.5 shrink-0" style={{ color: tierAccent }} />
          {theme.layers.length} efeito{theme.layers.length === 1 ? "" : "s"}
          {theme.border !== "none" && " + borda animada"}
        </p>

        <div className="mt-auto space-y-2">
          <AuraPriceTag listPrice={item.auraCost} isVip={isVip} />

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
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Shirt className="size-3.5" />}
              {equipped ? "Equipado" : "Equipar"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!requireLogin()) return
                setConfirmOpen(true)
              }}
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

      <PurchaseConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        itemName={theme.name}
        listPrice={item.auraCost}
        isVip={isVip}
        balance={balance}
        confirmLabel="Resgatar"
        loading={loading}
        onConfirm={handleRedeem}
      />
    </div>
  )
}
