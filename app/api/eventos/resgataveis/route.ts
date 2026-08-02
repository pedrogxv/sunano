import { NextResponse } from "next/server"

import { getClaimedMedalIds, listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/eventos/resgataveis — status pessoal de eventos, consumido pelo
 * client (badge da sidebar em `PublicSidebar` e `EventsShowcase` na Home).
 * Fica fora de `getHomeData`/`listActiveEventsForDisplay` de propósito: essas
 * duas continuam sem estado por usuário para a Home poder ser cacheada (ISR).
 *
 * "Resgatável" = evento `manual_opt_in`, ativo, com vaga, que o usuário ainda
 * não resgatou — mesma regra do botão "Resgatar" em `EventCard`.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ count: 0, claimedMedalIds: [] })
  }

  const [events, claimedMedalIds] = await Promise.all([
    listActiveEventsForDisplay(),
    getClaimedMedalIds(userId),
  ])

  const claimedSet = new Set(claimedMedalIds)
  const count = events.filter(
    (event) =>
      event.active &&
      event.criteriaType === "manual_opt_in" &&
      !claimedSet.has(event.medalId) &&
      event.currentCount < event.maxParticipants
  ).length

  return NextResponse.json({ count, claimedMedalIds })
}
