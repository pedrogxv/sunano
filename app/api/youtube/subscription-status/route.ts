import { NextResponse } from "next/server"

import { hasConfirmedYoutubeSubscription } from "@/lib/server/repositories/youtube-subscription-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isYoutubeSubscriptionEnabled } from "@/lib/youtube-subscription"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/youtube/subscription-status — se o usuário logado já confirmou a
 * inscrição no canal do YouTube. Consumido por `AuraMissionsBadge` (TopBar) e
 * pelos componentes que exibem `YoutubeSubscriptionCard`.
 */
export async function GET() {
  if (!isYoutubeSubscriptionEnabled()) {
    return NextResponse.json({ confirmed: false })
  }

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const confirmed = await hasConfirmedYoutubeSubscription(userId)
  return NextResponse.json({ confirmed })
}
