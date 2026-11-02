"use client"

import { useState } from "react"
import { UserPen } from "lucide-react"

import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import type { DisplayNameCooldown } from "@/lib/server/repositories/aura-store-repository"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { AuraPerkCard, PerkAction, PerkStatus } from "@/components/aura/AuraPerkCard"
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
    <AuraPerkCard
      accent="cyan"
      icon={<UserPen strokeWidth={1.5} />}
      title={item.name}
      description={item.description}
      price={<AuraPriceTag listPrice={item.auraCost} isVip={isVip} />}
      action={
        cooldown.onCooldown ? (
          <PerkStatus
            accent="cyan"
            label="Em cooldown"
            detail={cooldown.endsAt ? `disponível em ${formatCooldownEnds(cooldown.endsAt)}` : null}
          />
        ) : (
          <PerkAction
            accent="cyan"
            label="Trocar nome"
            canAfford={canAfford}
            onClick={() => {
              if (!requireLogin()) return
              setModalOpen(true)
            }}
          />
        )
      }
    >
      <ChangeDisplayNameModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        currentName={currentName}
        onChanged={(newName, newSlug) => {
          onChanged(newName, newSlug, price.finalPrice)
          setModalOpen(false)
        }}
      />
    </AuraPerkCard>
  )
}
