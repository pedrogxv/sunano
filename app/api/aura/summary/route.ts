import { NextResponse } from "next/server"

import { getUserAuraRank, getUserAuraTotalEarned, getUserAuraUsage } from "@/lib/server/repositories/aura-repository"
import { getUserStreak } from "@/lib/server/repositories/achievements-repository"
import { streakAuraMultiplierBps } from "@/lib/streak-multiplier"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/aura/summary — saldo, uso do limite diário de reações, ofensiva
 * e multiplicador ativo do usuário logado. Consumido pelo badge de Aura na
 * TopBar (`components/layout/AuraMissionsBadge.tsx`) e pela Central de Aura
 * (`app/aura/page.tsx` busca isso direto pelo repositório; esta rota é só
 * para o client). Payload é sempre um superset do que já existia — extensões
 * aqui não quebram consumidores antigos.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const [usage, streak, totalEarned, rank] = await Promise.all([
    getUserAuraUsage(userId),
    getUserStreak(userId),
    getUserAuraTotalEarned(userId),
    getUserAuraRank(userId),
  ])

  return NextResponse.json({
    ...usage,
    streak: streak.current,
    longestStreak: streak.longest,
    multiplierBps: streakAuraMultiplierBps(streak.current),
    totalEarned,
    rank,
  })
}
