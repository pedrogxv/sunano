import { NextRequest, NextResponse } from "next/server"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { resolveChannelId } from "@/lib/server/integrations/youtube"
import { confirmYoutubeSubscription } from "@/lib/server/repositories/youtube-subscription-repository"

/**
 * Callback dedicado do fluxo "Confirmar inscrição no YouTube" — separado de
 * app/auth/callback/route.ts (login/cadastro) porque aqui o OAuth pede um
 * scope extra (youtube.readonly) só usado para checar a inscrição, e não
 * deve se misturar com a lógica de criar perfil/sessão do login normal.
 *
 * `session.provider_token` (access token do Google) só é lido aqui, na
 * própria requisição — nunca persistido.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = sanitizeNextPath(searchParams.get("next"), "/aura")

  if (!code) {
    return NextResponse.redirect(`${origin}${next}?youtube=error`)
  }

  const supabase = await createSupabaseServerClient()
  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !sessionData.session || !sessionData.user) {
    return NextResponse.redirect(`${origin}${next}?youtube=error`)
  }

  const providerToken = sessionData.session.provider_token
  if (!providerToken) {
    // Google não devolveu o access token (ex.: usuário já tinha consentido
    // antes e o prompt não forçou re-consentimento) — pede para tentar de novo.
    return NextResponse.redirect(`${origin}${next}?youtube=no_token`)
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim()
  if (!apiKey) {
    console.error("[auth/youtube/callback] YOUTUBE_API_KEY não definida.")
    return NextResponse.redirect(`${origin}${next}?youtube=error`)
  }

  try {
    const channelId = await resolveChannelId(apiKey)

    const subscriptionUrl = new URL("https://www.googleapis.com/youtube/v3/subscriptions")
    subscriptionUrl.searchParams.set("part", "id")
    subscriptionUrl.searchParams.set("mine", "true")
    subscriptionUrl.searchParams.set("forChannelId", channelId)

    const response = await fetch(subscriptionUrl, {
      headers: { Authorization: `Bearer ${providerToken}` },
    })

    if (!response.ok) {
      console.error(`[auth/youtube/callback] YouTube API error (${response.status})`)
      return NextResponse.redirect(`${origin}${next}?youtube=error`)
    }

    const data = (await response.json()) as { items?: unknown[] }
    const isSubscribed = Array.isArray(data.items) && data.items.length > 0

    if (!isSubscribed) {
      return NextResponse.redirect(`${origin}${next}?youtube=not_subscribed`)
    }

    await confirmYoutubeSubscription(sessionData.user.id)
    return NextResponse.redirect(`${origin}${next}?youtube=confirmed`)
  } catch (error) {
    console.error("[auth/youtube/callback] falha ao verificar inscrição:", error)
    return NextResponse.redirect(`${origin}${next}?youtube=error`)
  }
}
