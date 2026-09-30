import { NextResponse } from "next/server"

import { getUserAuraBalance } from "@/lib/server/repositories/aura-repository"
import {
  getClaimedMedalIds,
  hasValidStorePurchase,
  listActiveEventsForDisplay,
} from "@/lib/server/repositories/events-repository"
import { getVipStatus } from "@/lib/server/repositories/aura-store-repository"
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
 * (ou ilimitado) e saldo de Aura suficiente, ou `store_purchase` com vaga e
 * compra paga na Loja — ativo e ainda não resgatado pelo usuário. Mesma
 * regra do botão "Resgatar" em `EventCard`.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ count: 0, claimedMedalIds: [] })
  }

  const [events, claimedMedalIds, auraBalance, vipStatus] = await Promise.all([
    listActiveEventsForDisplay(),
    getClaimedMedalIds(userId),
    getUserAuraBalance(userId),
    getVipStatus(userId),
  ])

  const claimedSet = new Set(claimedMedalIds)
  // Só pergunta pela compra quando há card de compra por resgatar: esta rota
  // roda a cada carregamento da sidebar, e quase sempre a resposta não importa.
  const hasPurchase = events.some(
    (event) => event.active && event.criteriaType === "store_purchase" && !claimedSet.has(event.medalId)
  )
    ? await hasValidStorePurchase(userId)
    : false

  const count = events.filter((event) => {
    if (!event.active || claimedSet.has(event.medalId)) return false
    if (event.requiresVip && !vipStatus.active) return false
    const hasSlot = event.maxParticipants === null || event.currentCount < event.maxParticipants
    if (event.criteriaType === "manual_opt_in") return hasSlot
    if (event.criteriaType === "aura_redeem") return hasSlot && auraBalance >= (event.auraCost ?? 0)
    if (event.criteriaType === "store_purchase") return hasSlot && hasPurchase
    return false
  }).length

  return NextResponse.json({ count, claimedMedalIds })
}
