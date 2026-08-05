import { NextResponse } from "next/server"

import { getUserAuraUsage } from "@/lib/server/repositories/aura-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/aura/summary — saldo + uso do limite diário de reações do
 * usuário logado, consumido pelo badge de Aura na TopBar
 * (`components/layout/AuraBalanceBadge.tsx`).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const usage = await getUserAuraUsage(userId)
  return NextResponse.json(usage)
}
