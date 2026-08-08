import { NextResponse } from "next/server"

import { getUserAuraBalance } from "@/lib/server/repositories/aura-repository"
import { getClaimedMedalIds, listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/conquistas/resgataveis — status pessoal de eventos, consumido pelo
 * client (badge da sidebar em `PublicSidebar` e `EventsShowcase` na Home).
 * Fica fora de `getHomeData`/`listActiveEventsForDisplay` de propósito: essas
 * duas continuam sem estado por usuário para a Home poder ser cacheada (ISR).
 *
 * "Resgatável" = evento `manual_opt_in` com vaga, ou `aura_redeem` com vaga
 * (ou ilimitado) e saldo de Aura suficiente — ativo e ainda não resgatado
 * pelo usuário. Mesma regra do botão "Resgatar" em `EventCard`.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ count: 0, claimedMedalIds: [] })
  }

  const [events, claimedMedalIds, auraBalance] = await Promise.all([
    listActiveEventsForDisplay(),
    getClaimedMedalIds(userId),
    getUserAuraBalance(userId),
  ])

  const claimedSet = new Set(claimedMedalIds)
  const count = events.filter((event) => {
    if (!event.active || claimedSet.has(event.medalId)) return false
    const hasSlot = event.maxParticipants === null || event.currentCount < event.maxParticipants
    if (event.criteriaType === "manual_opt_in") return hasSlot
    if (event.criteriaType === "aura_redeem") return hasSlot && auraBalance >= (event.auraCost ?? 0)
    return false
  }).length

  return NextResponse.json({ count, claimedMedalIds })
}
