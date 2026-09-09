"use client"

import { useState } from "react"
import { UserPen } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import type { DisplayNameCooldown } from "@/lib/server/repositories/aura-store-repository"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { AuraPriceTag } from "@/components/aura/AuraPriceTag"
import { ChangeDisplayNameModal } from "@/components/profile/ChangeDisplayNameModal"

interface DisplayNameChangeCardProps {
  item: AuraItem
  balance: number
  /** VIP ativo agora — 10% off no custo da troca. */
  isVip: boolean
  cooldown: DisplayNameCooldown
  currentName: string
  requireLogin: () => boolean
  onChanged: (newName: string, newSlug: string, cost: number) => void
}

function formatCooldownEnds(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function DisplayNameChangeCard({
  item,
  balance,
  isVip,
  cooldown,
  currentName,
  requireLogin,
  onChanged,
}: DisplayNameChangeCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const price = auraPriceForVip(item.auraCost, isVip)
  const canAfford = balance >= price.finalPrice

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-1", CARD_SURFACE_INTERACTIVE)}>
      <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden bg-[var(--card-image-bg)]">
        <UserPen className="size-11 text-cyan-400/60" strokeWidth={1.15} />
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3 pb-2.5 pt-2">
        <h3 className="line-clamp-1 font-sans text-[12px] font-semibold leading-tight tracking-normal text-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-2 text-[9.5px] font-medium leading-snug text-muted-foreground">{item.description}</p>
        )}

        <div className="mt-auto space-y-1.5 pt-1">
          <AuraPriceTag listPrice={item.auraCost} isVip={isVip} />

          {cooldown.onCooldown ? (
            <div className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-border px-3 py-1.5 text-[10.5px] font-bold text-muted-foreground">
              <span>Em cooldown</span>
              {cooldown.endsAt && (
                <span className="text-[9px] font-medium text-muted-foreground/70">
                  disponível em {formatCooldownEnds(cooldown.endsAt)}
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!requireLogin()) return
                setModalOpen(true)
              }}
              disabled={!canAfford}
              title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[10.5px] font-bold transition-colors",
                canAfford
                  ? "bg-cyan-400 text-[#00201c] hover:bg-cyan-300"
                  : "cursor-not-allowed bg-muted/40 text-muted-foreground"
              )}
            >
              {canAfford ? "Trocar nome" : "Saldo insuficiente"}
            </button>
          )}
        </div>
      </div>

      <ChangeDisplayNameModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        currentName={currentName}
        onChanged={(newName, newSlug) => {
          onChanged(newName, newSlug, price.finalPrice)
          setModalOpen(false)
        }}
      />
    </div>
  )
}
