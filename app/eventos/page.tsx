import { getClaimedMedalIds, listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { EventsContent } from "./events-content"

export const revalidate = 30

export default async function EventosPage() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  const [events, claimedMedalIds] = await Promise.all([
    listActiveEventsForDisplay(),
    userId ? getClaimedMedalIds(userId) : Promise.resolve([]),
  ])

  return (
    <EventsContent
      initialEvents={events}
      initialClaimedMedalIds={claimedMedalIds}
      isLoggedIn={Boolean(userId)}
    />
  )
}
