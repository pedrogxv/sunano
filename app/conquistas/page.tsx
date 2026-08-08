import { getUserAuraBalance } from "@/lib/server/repositories/aura-repository"
import { getClaimedMedalIds, listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import { getUserAchievements } from "@/lib/server/repositories/achievements-repository"
import { countForumActivity } from "@/lib/server/repositories/profile-showcase-repository"
import { countFollowers } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { EventsContent } from "./events-content"

export const revalidate = 30

export default async function ConquistasPage() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const [events, claimedMedalIds, auraBalance, achievements, forumActivity, followers] = await Promise.all([
    listActiveEventsForDisplay(),
    userId ? getClaimedMedalIds(userId) : Promise.resolve([]),
    userId ? getUserAuraBalance(userId) : Promise.resolve(0),
    userId ? getUserAchievements(userId) : Promise.resolve([]),
    userId ? countForumActivity(userId) : Promise.resolve({ posts: 0, comments: 0 }),
    userId ? countFollowers(userId) : Promise.resolve(0),
  ])

  return (
    <EventsContent
      initialEvents={events}
      initialClaimedMedalIds={claimedMedalIds}
      initialAuraBalance={auraBalance}
      isLoggedIn={Boolean(userId)}
      achievements={achievements}
      achievementCounts={{ posts: forumActivity.posts, comments: forumActivity.comments, followers }}
    />
  )
}
