import { NextResponse } from "next/server"

import { hasConfirmedDiscordMembership } from "@/lib/server/repositories/discord-membership-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isDiscordMembershipEnabled } from "@/lib/discord-membership"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/discord/membership-status — se o usuário logado já confirmou que é
 * membro do servidor do Discord. Espelha
 * /api/youtube/subscription-status; consumido por `AuraMissionsBadge` (TopBar).
 */
export async function GET() {
  if (!isDiscordMembershipEnabled()) {
    return NextResponse.json({ confirmed: false })
  }

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const confirmed = await hasConfirmedDiscordMembership(userId)
  return NextResponse.json({ confirmed })
}
