import { Suspense } from "react"

import { getUserAuraBalance, getUserAuraTotalEarned } from "@/lib/server/repositories/aura-repository"
import { getClaimedMedalIds, listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import { getUserAchievements } from "@/lib/server/repositories/achievements-repository"
import { countForumActivity } from "@/lib/server/repositories/profile-showcase-repository"
import { countFollowers } from "@/lib/server/repositories/users-repository"
import { getVipStatus } from "@/lib/server/repositories/aura-store-repository"
import { hasConfirmedYoutubeSubscription } from "@/lib/server/repositories/youtube-subscription-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isYoutubeSubscriptionEnabled } from "@/lib/youtube-subscription"
import { hasConfirmedDiscordMembership } from "@/lib/server/repositories/discord-membership-repository"
import { isDiscordMembershipEnabled } from "@/lib/discord-membership"
import { EventsContent } from "./events-content"

export const dynamic = "force-dynamic"

export default async function ConquistasPage() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const [
    events,
    claimedMedalIds,
    auraBalance,
    auraTotalEarned,
    achievements,
    forumActivity,
    followers,
    youtubeConfirmed,
    discordConfirmed,
    vipStatus,
  ] = await Promise.all([
    listActiveEventsForDisplay(),
    userId ? getClaimedMedalIds(userId) : Promise.resolve([]),
    userId ? getUserAuraBalance(userId) : Promise.resolve(0),
    userId ? getUserAuraTotalEarned(userId) : Promise.resolve(0),
    userId ? getUserAchievements(userId) : Promise.resolve([]),
    userId ? countForumActivity(userId) : Promise.resolve({ posts: 0, comments: 0 }),
    userId ? countFollowers(userId) : Promise.resolve(0),
    userId && isYoutubeSubscriptionEnabled()
      ? hasConfirmedYoutubeSubscription(userId)
      : Promise.resolve(false),
    userId && isDiscordMembershipEnabled()
      ? hasConfirmedDiscordMembership(userId)
      : Promise.resolve(false),
    userId ? getVipStatus(userId) : Promise.resolve({ active: false, expiresAt: null }),
  ])

  return (
    <Suspense>
      <EventsContent
        initialEvents={events}
        initialClaimedMedalIds={claimedMedalIds}
        initialAuraBalance={auraBalance}
        isLoggedIn={Boolean(userId)}
        isVip={vipStatus.active}
        achievements={achievements}
        achievementCounts={{
          posts: forumActivity.posts,
          comments: forumActivity.comments,
          followers,
          aura_earned: auraTotalEarned,
        }}
        youtubeEnabled={isYoutubeSubscriptionEnabled()}
        youtubeConfirmed={youtubeConfirmed}
        discordEnabled={isDiscordMembershipEnabled()}
        discordConfirmed={discordConfirmed}
      />
    </Suspense>
  )
}
