import Link from "next/link"
import { ArrowRight, Crown, Sparkles, Trophy } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { absoluteUrl } from "@/lib/site-url"
import { PERSONAL_TIERS, PERSONAL_TIER_THEMES, groupByTier } from "@/lib/personal-tierlist-theme"
import { ShareMenu } from "@/components/forum/ShareMenu"
import { PersonalTierlistPublicView } from "./PersonalTierlistPublicView"
import { TierlistNoteCard } from "./TierlistNoteCard"
import { TierlistHeartButton, TierlistHeartCount } from "./TierlistHeartButton"
import { TierlistVipGate } from "./TierlistVipGate"
import type { TierlistItem } from "@/lib/personal-tierlist"

/** Quantos itens cada linha mostra no preview antes de virar "+N". */
const PREVIEW_ITEMS_PER_TIER = 8

interface PersonalTierlistSummaryCardProps {
  items: TierlistItem[]
  itemCount: number
  tierlistHref: string
  /** Nome do dono — usado no texto de compartilhamento. */
  ownerName: string
  /** Id do dono — alvo do coração. */
  ownerId: string
  /** Mini comentário que o dono deixou na tierlist (`null` quando não escreveu). */
  note?: string | null
  heartsCount?: number
  /** O visitante atual já deu coração? */
  viewerHearted?: boolean
  /** Visitante logado e que não é o dono — só então o coração vira botão. */
  canHeart?: boolean
  /** É o próprio dono visitando o perfil? Só então mostramos um CTA quando a tierlist está vazia. */
  isOwner?: boolean
  /** VIP ativo do dono — decide entre "monte sua tierlist" e "recurso exclusivo VIP". */
  ownerIsVip?: boolean
}

/**
 * Bloco "Tierlist pessoal" no perfil público.
 *
 * Em vez de um card-atalho de uma linha, mostra o board de verdade (versão
 * `preview` do `PersonalTierlistPublicView`) com um rodapé "Ver completo" —
 * quem chega no perfil já vê o ranking, e não só a promessa dele.
 *
 * Vazio: nada para visitantes; CTA para o dono (a página da tierlist é o
 * único lugar onde o editor existe, então sem esse CTA o dono não chega lá).
 */
export function PersonalTierlistSummaryCard({
  items,
  itemCount,
  tierlistHref,
  ownerName,
  ownerId,
  note = null,
  heartsCount = 0,
  viewerHearted = false,
  canHeart = false,
  isOwner = false,
  ownerIsVip = false,
}: PersonalTierlistSummaryCardProps) {
  if (itemCount === 0 && !isOwner) return null

  // Dono sem VIP e sem nada montado: o card inteiro vira o convite, com a
  // lista de vantagens e o CTA para `/aura`. Antes isto era um link para a
  // página da tierlist, que só levava a outro aviso de "exclusivo VIP" —
  // dois cliques até descobrir onde se assina.
  if (itemCount === 0 && !ownerIsVip) {
    return (
      <section className="space-y-3">
        <SectionHeading itemCount={0} />
        <TierlistVipGate variant="locked" />
      </section>
    )
  }

  if (itemCount === 0) {
    return (
      <section className="space-y-3">
        <SectionHeading itemCount={0} />
        <Link
          href={tierlistHref}
          className={cn(
            "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-dashed p-5 transition-colors",
            CARD_SURFACE,
            "hover:border-[var(--vip-accent)]/50"
          )}
        >
          {/* Fantasma do board ao fundo: mostra o que a feature entrega antes de existir conteúdo. */}
          <div className="pointer-events-none absolute inset-0 -z-10 flex flex-col justify-center gap-1 opacity-[0.12]">
            {PERSONAL_TIERS.map((tier) => (
              <div
                key={tier}
                className={cn("h-5 w-full bg-gradient-to-r", PERSONAL_TIER_THEMES[tier].accent)}
              />
            ))}
          </div>

          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: "var(--vip-accent)" }}
          >
            <Sparkles className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Crown className="size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />
              Monte sua tierlist pessoal
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Classifique do S ao D os periféricos que você já usou e mostre no seu perfil.
            </p>
          </div>

          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
      </section>
    )
  }

  const byTier = groupByTier(items)
  const tiersUsed = PERSONAL_TIERS.filter((tier) => (byTier.get(tier)?.length ?? 0) > 0)
  const topItems = byTier.get("S") ?? []

  return (
    <section className="space-y-3">
      <SectionHeading
        itemCount={itemCount}
        tiersUsed={tiersUsed.length}
        share={
          <>
            {canHeart ? (
              <TierlistHeartButton
                ownerId={ownerId}
                initialHearted={viewerHearted}
                initialCount={heartsCount}
                size="sm"
              />
            ) : (
              <TierlistHeartCount count={heartsCount} size="sm" />
            )}
            <ShareMenu
              url={absoluteUrl(tierlistHref)}
              title={`Tierlist de ${ownerName} na Sunano`}
              showEmbed={false}
            />
          </>
        }
      />

      <div className="space-y-2">
        {/* Recado do dono só de leitura aqui: o editor mora na página da
            tierlist, para o perfil não virar dois lugares de edição. */}
        <TierlistNoteCard note={note} canEdit={false} compact />

        <PersonalTierlistPublicView items={items} variant="preview" maxPerTier={PREVIEW_ITEMS_PER_TIER} />

        <Link
          href={tierlistHref}
          className={cn(
            "group flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
            CARD_SURFACE,
            "hover:border-[var(--vip-accent)]/50"
          )}
        >
          <span className="min-w-0 text-xs text-muted-foreground">
            {topItems.length > 0 ? (
              <>
                Tier S:{" "}
                <span className="font-medium text-foreground">
                  {topItems
                    .slice(0, 2)
                    .map((item) => item.peripheral.name)
                    .join(", ")}
                </span>
                {topItems.length > 2 && ` +${topItems.length - 2}`}
              </>
            ) : (
              `${itemCount} ${itemCount === 1 ? "periférico classificado" : "periféricos classificados"}`
            )}
          </span>

          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-foreground">
            {isOwner ? "Editar" : "Ver completo"}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>

        {/* Dono que perdeu o VIP com a tierlist já montada: versão de uma
            linha, porque aqui o board acima já mostra que nada sumiu. */}
        {isOwner && !ownerIsVip && <TierlistVipGate variant="expired" compact />}
      </div>
    </section>
  )
}

function SectionHeading({
  itemCount,
  tiersUsed,
  share,
}: {
  itemCount: number
  tiersUsed?: number
  share?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Trophy className="size-4" style={{ color: "var(--vip-accent)" }} />
        Tierlist pessoal
        <span
          className="rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ borderColor: "var(--vip-accent)", color: "var(--vip-accent)" }}
        >
          Beta
        </span>
      </h2>

      <div className="flex items-center gap-3">
        {itemCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {itemCount} {itemCount === 1 ? "item" : "itens"}
            {tiersUsed ? ` · ${tiersUsed} ${tiersUsed === 1 ? "tier" : "tiers"}` : ""}
          </p>
        )}
        {share}
      </div>
    </div>
  )
}
