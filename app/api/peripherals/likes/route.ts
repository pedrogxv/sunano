import { NextResponse } from "next/server"

import { getFavoriteIds } from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/peripherals/likes — ids favoritados pelo usuário autenticado.
 * Deslogado retorna lista vazia (200), não 401 — usado só para pintar os
 * corações já preenchidos ao carregar `/perifericos`.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ ids: [] })
  }

  const ids = await getFavoriteIds(authData.user.id)
  return NextResponse.json({ ids })
}
