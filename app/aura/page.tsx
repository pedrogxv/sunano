import { Suspense } from "react"

import {
  getUserAuraBalance,
  getUserAuraRank,
  getUserAuraUsage,
} from "@/lib/server/repositories/aura-repository"
import { getDailyMissionsToday, getUserStreak } from "@/lib/server/repositories/achievements-repository"
import { EMPTY_DAILY_MISSIONS } from "@/lib/achievements"
import {
  getDisplayNameCooldown,
  getEquippedAvatarFrameId,
  getEquippedMiniProfileBg,
  getPeripheralOwners,
  getStreakShieldStatus,
  getUserAuraItemIds,
  getVipStatus,
  listActiveAuraItems,
} from "@/lib/server/repositories/aura-store-repository"
import { hasConfirmedYoutubeSubscription } from "@/lib/server/repositories/youtube-subscription-repository"
import { isYoutubeSubscriptionEnabled } from "@/lib/youtube-subscription"
import { hasConfirmedDiscordMembership } from "@/lib/server/repositories/discord-membership-repository"
import { getDiscordInviteUrl, isDiscordMembershipEnabled } from "@/lib/discord-membership"
import { getProfileShippingPrefill, getUserProfileSettings } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { AuraCenterContent } from "@/components/aura/AuraCenterContent"
import { getStreakFrameItemIds, getVipFounderItemId } from "@/lib/server/repositories/vip-founder-repository"
import { getTrustSummary } from "@/lib/server/repositories/trust-repository"
import { TRUST_BASE_SCORE, canRedeemPhysicalItem, testerEligibility, trustLevelOf } from "@/lib/trust-factor"

export const dynamic = "force-dynamic"

export default async function AuraCenterPage() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const [
    balance,
    rank,
    streak,
    usage,
    items,
    ownedItemIds,
    equippedItemId,
    equippedMiniBg,
    missions,
    youtubeConfirmed,
    discordConfirmed,
    vipStatus,
    nameCooldown,
    profileSettings,
    streakShield,
    peripheralOwners,
    shippingPrefill,
    founderItemId,
    streakFrameItemIds,
    trust,
  ] = await Promise.all([
    userId ? getUserAuraBalance(userId) : Promise.resolve(0),
    userId ? getUserAuraRank(userId) : Promise.resolve(null),
    userId
      ? getUserStreak(userId)
      : Promise.resolve({ current: 0, longest: 0, shield: null, frozen: false, frozenUntil: null }),
    userId
      ? getUserAuraUsage(userId)
      : Promise.resolve({
          balance: 0,
          givenToday: 0,
          limit: 50,
          limitReached: false,
          nextSlotAt: null,
          trustTier: "normal" as const,
          pairLimit: 3,
        }),
    listActiveAuraItems(),
    userId ? getUserAuraItemIds(userId) : Promise.resolve(new Set<string>()),
    userId ? getEquippedAvatarFrameId(userId) : Promise.resolve(null),
    userId ? getEquippedMiniProfileBg(userId) : Promise.resolve(null),
    userId ? getDailyMissionsToday(userId) : Promise.resolve(EMPTY_DAILY_MISSIONS),
    userId && isYoutubeSubscriptionEnabled()
      ? hasConfirmedYoutubeSubscription(userId)
      : Promise.resolve(false),
    userId && isDiscordMembershipEnabled()
      ? hasConfirmedDiscordMembership(userId)
      : Promise.resolve(false),
    userId ? getVipStatus(userId) : Promise.resolve({ active: false, expiresAt: null }),
    userId
      ? getDisplayNameCooldown(userId)
      : Promise.resolve({ onCooldown: false, changedAt: null, endsAt: null }),
    userId ? getUserProfileSettings(userId) : Promise.resolve(null),
    userId
      ? getStreakShieldStatus(userId)
      : Promise.resolve({ armed: false, graceDays: null }),
    getPeripheralOwners(),
    userId ? getProfileShippingPrefill(userId) : Promise.resolve(null),
    // A Moldura de Fundador não vem em `listActiveAuraItems()` (linha
    // `active = false`), então o id dela é buscado à parte — é o que liga a
    // posse em `ownedItemIds` à vitrine.
    getVipFounderItemId(),
    // Idem para as molduras de Ofensiva: `active = false`, então não vêm em
    // `listActiveAuraItems()` e a vitrine precisa dos ids à parte.
    getStreakFrameItemIds(),
    // Trust Factor — quem SUBSTITUIU o antigo "nível verificado" como trava
    // do prêmio físico. Visitante deslogado recebe a base (50), que não
    // resgata nada: o card fica visível, o botão travado.
    userId
      ? getTrustSummary(userId)
      : Promise.resolve({
          score: TRUST_BASE_SCORE,
          level: trustLevelOf(TRUST_BASE_SCORE),
          status: "active" as const,
          updatedAt: null,
          canRedeemPhysical: canRedeemPhysicalItem(TRUST_BASE_SCORE, "active"),
          tester: testerEligibility(TRUST_BASE_SCORE, "active"),
          flags: [],
        }),
  ])

  return (
    <Suspense>
      <AuraCenterContent
        isLoggedIn={Boolean(userId)}
        balance={balance}
        rank={rank}
        streak={streak}
        usage={usage}
        items={items}
        initialOwnedItemIds={[...ownedItemIds]}
        initialEquippedItemId={equippedItemId}
        initialEquippedMiniBgId={equippedMiniBg?.itemId ?? null}
        missions={missions}
        youtubeConfirmed={youtubeConfirmed}
        discordEnabled={isDiscordMembershipEnabled()}
        discordConfirmed={discordConfirmed}
        discordInviteUrl={getDiscordInviteUrl()}
        vipStatus={vipStatus}
        nameCooldown={nameCooldown}
        displayName={profileSettings?.display_name ?? ""}
        currentUserSlug={profileSettings?.display_slug ?? null}
        currentUserAvatarUrl={profileSettings?.avatar_url ?? null}
        streakShield={streakShield}
        peripheralOwners={[...peripheralOwners.entries()]}
        shippingPrefill={shippingPrefill}
        founderItemId={founderItemId}
        streakFrameItemIds={streakFrameItemIds}
        trust={trust}
      />
    </Suspense>
  )
}
