import { NextResponse } from "next/server"

import { getDailyMissionsToday, getUserStreak } from "@/lib/server/repositories/achievements-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/achievements/missions — estado das 3 missões diárias de hoje
 * (UTC) + ofensiva atual do usuário logado. Consumido por `MissionsBadge`
 * na TopBar (ver `lib/achievements.ts`).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const [missions, streak] = await Promise.all([getDailyMissionsToday(userId), getUserStreak(userId)])
  return NextResponse.json({ missions, streak })
}
