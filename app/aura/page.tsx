import { Suspense } from "react"

import {
  getUserAuraBalance,
  getUserAuraRank,
  getUserAuraTotalEarned,
  getUserAuraUsage,
} from "@/lib/server/repositories/aura-repository"
import { getDailyMissionsToday, getUserStreak } from "@/lib/server/repositories/achievements-repository"
import { EMPTY_DAILY_MISSIONS } from "@/lib/achievements"
import {
  getDisplayNameCooldown,
  getEquippedAvatarFrameId,
  getUserAuraItemIds,
  getVipStatus,
  listActiveAuraItems,
} from "@/lib/server/repositories/aura-store-repository"
import { hasConfirmedYoutubeSubscription } from "@/lib/server/repositories/youtube-subscription-repository"
import { getUserProfileSettings } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { AuraCenterContent } from "@/components/aura/AuraCenterContent"

export const dynamic = "force-dynamic"

export default async function AuraCenterPage() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const [
    balance,
    totalEarned,
    rank,
    streak,
    usage,
    items,
    ownedItemIds,
    equippedItemId,
    missions,
    youtubeConfirmed,
    vipStatus,
    nameCooldown,
    profileSettings,
  ] = await Promise.all([
    userId ? getUserAuraBalance(userId) : Promise.resolve(0),
    userId ? getUserAuraTotalEarned(userId) : Promise.resolve(0),
    userId ? getUserAuraRank(userId) : Promise.resolve(null),
    userId ? getUserStreak(userId) : Promise.resolve({ current: 0, longest: 0 }),
    userId
      ? getUserAuraUsage(userId)
      : Promise.resolve({ balance: 0, givenToday: 0, limit: 50, limitReached: false, nextSlotAt: null }),
    listActiveAuraItems(),
    userId ? getUserAuraItemIds(userId) : Promise.resolve(new Set<string>()),
    userId ? getEquippedAvatarFrameId(userId) : Promise.resolve(null),
    userId ? getDailyMissionsToday(userId) : Promise.resolve(EMPTY_DAILY_MISSIONS),
    userId ? hasConfirmedYoutubeSubscription(userId) : Promise.resolve(false),
    userId ? getVipStatus(userId) : Promise.resolve({ active: false, expiresAt: null }),
    userId
      ? getDisplayNameCooldown(userId)
      : Promise.resolve({ onCooldown: false, changedAt: null, endsAt: null }),
    userId ? getUserProfileSettings(userId) : Promise.resolve(null),
  ])

  return (
    <Suspense>
      <AuraCenterContent
        isLoggedIn={Boolean(userId)}
        balance={balance}
        totalEarned={totalEarned}
        rank={rank}
        streak={streak}
        usage={usage}
        items={items}
        initialOwnedItemIds={[...ownedItemIds]}
        initialEquippedItemId={equippedItemId}
        missions={missions}
        youtubeConfirmed={youtubeConfirmed}
        vipStatus={vipStatus}
        nameCooldown={nameCooldown}
        displayName={profileSettings?.display_name ?? ""}
      />
    </Suspense>
  )
}
