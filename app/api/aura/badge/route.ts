import { NextResponse } from "next/server"

import { getDailyMissionsToday, getUserStreak } from "@/lib/server/repositories/achievements-repository"
import {
  getUserAuraRank,
  getUserAuraTotalEarned,
  getUserAuraUsage,
} from "@/lib/server/repositories/aura-repository"
import { streakAuraMultiplierBps } from "@/lib/streak-multiplier"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/aura/badge — tudo que o badge da TopBar
 * (`components/layout/AuraMissionsBadge.tsx`) precisa, num payload só.
 *
 * Antes o badge chamava `/api/achievements/missions` e `/api/aura/summary`
 * separadamente a cada tick do polling — duas invocações e dois
 * `auth.getUser()` por minuto, por aba aberta, para desenhar um único ícone.
 * `getUserStreak` ainda por cima era executado nas duas pontas. Unificar não
 * deixa nada mais lento (as queries já rodavam em paralelo dentro de cada
 * rota) e corta metade das invocações do maior consumidor do projeto.
 *
 * As duas rotas antigas continuam existindo: `/api/aura/summary` é o contrato
 * público do saldo e pode ter outros consumidores no futuro. Esta aqui é
 * específica do badge — mantenha o payload como superset do que ele usa.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // `getUserStreak` roda uma vez só e alimenta tanto o multiplicador quanto o
  // bloco de missões — era a query duplicada entre as duas rotas antigas.
  const [missions, streak, usage, totalEarned, rank] = await Promise.all([
    getDailyMissionsToday(userId),
    getUserStreak(userId),
    getUserAuraUsage(userId),
    getUserAuraTotalEarned(userId),
    getUserAuraRank(userId),
  ])

  return NextResponse.json({
    missions,
    streak,
    usage: {
      ...usage,
      streak: streak.current,
      longestStreak: streak.longest,
      multiplierBps: streakAuraMultiplierBps(streak.current),
      totalEarned,
      rank,
    },
  })
}
