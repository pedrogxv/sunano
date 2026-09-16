"use client"

import { Layers } from "lucide-react"
import { AuraAmount } from "@/components/ui/AuraIcon"

import { cn } from "@/lib/utils"
import type { AuraItem } from "@/lib/server/repositories/aura-store-repository"
import {
  MINI_PROFILE_BG_TIER_ACCENT,
  MINI_PROFILE_BG_TIER_COST,
  MINI_PROFILE_BG_TIER_LABEL,
  getMiniProfileBgTheme,
  type MiniProfileBgTier,
} from "@/lib/mini-profile-backgrounds"
import { MiniProfileBgCard } from "@/components/aura/MiniProfileBgCard"

/** Ordem de exibição: do mais barato ao mais caro, como uma vitrine sobe de vitrine. */
const TIER_ORDER: MiniProfileBgTier[] = ["raro", "epico", "lendario"]

interface MiniProfileBgSectionProps {
  /** Itens de kind `mini_profile_bg` vindos do catálogo. */
  items: AuraItem[]
  balance: number
  isVip: boolean
  ownedItemIds: Set<string>
  equippedItemId: string | null
  requireLogin: () => boolean
  onRedeemed: (itemId: string, cost: number) => void
  onEquipChange: (nextEquippedId: string | null) => void
}

/**
 * Seção "Fundos de Mini Perfil" da Central de Aura.
 *
 * Fica separada da grade genérica de itens porque estes cards são maiores (o
 * preview animado é o produto) e porque a leitura que importa aqui é a de
 * FAIXA: três blocos, do mais barato ao mais caro, com o preço no cabeçalho
 * de cada um — assim o "quanto mais caro, mais efeito" fica visível de
 * relance em vez de escondido em nove preços soltos numa grade só.
 *
 * Itens do banco sem tema no código (`getMiniProfileBgTheme` → null) são
 * ignorados: sem a arte não há o que vender.
 */
export function MiniProfileBgSection({
  items,
  balance,
  isVip,
  ownedItemIds,
  equippedItemId,
  requireLogin,
  onRedeemed,
  onEquipChange,
}: MiniProfileBgSectionProps) {
  const withTheme = items
    .map((item) => ({ item, theme: getMiniProfileBgTheme(item.slug) }))
    .filter((entry): entry is { item: AuraItem; theme: NonNullable<typeof entry.theme> } =>
      entry.theme !== null
    )

  if (withTheme.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Fundos de Mini Perfil</h2>
        <span className="flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          <Layers className="size-2.5" />
          Aparece no cartão que abre ao passar o mouse na sua foto
        </span>
      </div>

      {TIER_ORDER.map((tier) => {
        const ofTier = withTheme.filter((entry) => entry.theme.tier === tier)
        if (ofTier.length === 0) return null

        const accent = MINI_PROFILE_BG_TIER_ACCENT[tier]

        return (
          <div key={tier} className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black/85"
                style={{ backgroundColor: accent }}
              >
                {MINI_PROFILE_BG_TIER_LABEL[tier]}
              </span>
              <span className="font-display text-sm font-bold text-orange-400">
                <AuraAmount value={MINI_PROFILE_BG_TIER_COST[tier]} />
              </span>
              {/* Linha até a borda: separa as faixas sem virar mais um título. */}
              <span
                className={cn("h-px flex-1 bg-gradient-to-r to-transparent")}
                style={{ backgroundImage: `linear-gradient(to right, ${accent}55, transparent)` }}
                aria-hidden
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ofTier.map(({ item, theme }) => (
                <MiniProfileBgCard
                  key={item.id}
                  item={item}
                  theme={theme}
                  balance={balance}
                  isVip={isVip}
                  owned={ownedItemIds.has(item.id)}
                  equipped={equippedItemId === item.id}
                  requireLogin={requireLogin}
                  onRedeemed={(cost) => onRedeemed(item.id, cost)}
                  onEquipChange={onEquipChange}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
