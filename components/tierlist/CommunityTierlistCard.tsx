"use client"

import Link from "next/link"
import { Heart } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE, CARD_SURFACE_HOVER } from "@/lib/ui-styles"
import { profilePath } from "@/lib/profile-name"
import { resolveProfileMedia, type AccountTier } from "@/lib/account-tier"
import { sortTiers } from "@/lib/personal-tierlist-theme"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { PersonalTierlistPublicView } from "@/components/tierlist-pessoal/PersonalTierlistPublicView"
import { useT } from "@/lib/use-t"
import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

export type CommunityTierlistCardData = {
  user: {
    id: string
    displayName: string
    displaySlug: string
    avatarUrl: string | null
    accountTier: AccountTier
    vipExpiresAt: string | null
    frame: ProfileFrameIdentity
  }
  itemCount: number
  heartsCount: number
  note: string | null
  tiers: TierlistTierDef[]
  previewItems: TierlistItem[]
}

/**
 * Card de uma tierlist da comunidade em `/tierlist/comunidade`.
 *
 * Reaproveita o mini-board da tierlist pessoal (`PersonalTierlistPublicView`
 * `variant="preview"`, o mesmo do card resumido do perfil) e o bloco de
 * avatar/identidade do resto do site (iniciais sobre o gradiente do perfil
 * quando não há foto).
 */
export function CommunityTierlistCard({ data }: { data: CommunityTierlistCardData }) {
  const t = useT()
  const { user } = data
  const href = `${profilePath(user.displaySlug)}/tierlist`
  const orderedTiers = sortTiers(data.tiers)
  const avatar = resolveProfileMedia(user.avatarUrl, user.accountTier, user.vipExpiresAt)

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border transition-colors",
        CARD_SURFACE,
        CARD_SURFACE_HOVER
      )}
    >
      {/* Faixa de gradiente dos tiers — assinatura visual, igual ao header da
          tierlist pública do membro. */}
      <div className="flex h-1 w-full">
        {orderedTiers.map((tier) => (
          <div key={tier.id} className="flex-1" style={{ backgroundColor: tier.color }} />
        ))}
      </div>

      <div className="flex items-center gap-3 p-4">
        <Link href={profilePath(user.displaySlug)} className="shrink-0">
          <ProfileAvatar
            name={user.displayName}
            avatarUrl={avatar.src}
            size="md"
            frame={user.frame}
            animated={avatar.animated}
            freeze={avatar.needsFreeze}
          />
        </Link>

        <div className="min-w-0 flex-1">
          {/* <h2>: cada card é uma entrada da listagem — dá estrutura de
              cabeçalho ao nome do membro em vez de um <span> solto. */}
          <h2 className="min-w-0 text-sm font-semibold">
            <Link
              href={href}
              className="flex items-center gap-1.5 truncate text-foreground hover:underline"
            >
              {/* Sem coroa: o selo de VIP vem na moldura do avatar ao lado
                  (`ProfileAvatar`). */}
              <span className="truncate">Tierlist de {user.displayName}</span>
            </Link>
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" />
              {data.heartsCount}
            </span>
            <span aria-hidden>·</span>
            <span>{t.tierlist.community.itemsCount(data.itemCount)}</span>
          </p>
        </div>
      </div>

      {data.note && (
        <p className="line-clamp-2 px-4 pb-3 text-xs italic text-muted-foreground">
          &ldquo;{data.note}&rdquo;
        </p>
      )}

      {/* Mini-board — o card inteiro leva à tierlist completa, mas os itens do
          board também têm hover/link próprio, então a área do board não é um
          <Link> pai. */}
      <div className="px-4 pb-3">
        <PersonalTierlistPublicView
          tiers={orderedTiers}
          items={data.previewItems}
          variant="preview"
          maxPerTier={6}
        />
      </div>

      <Link
        href={href}
        className="mt-auto border-t border-border/60 px-4 py-2.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
      >
        {t.tierlist.community.viewFull}
      </Link>
    </article>
  )
}
