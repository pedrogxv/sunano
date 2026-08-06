import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { getUserPostAuraReaction, togglePostAura } from "@/lib/server/repositories/aura-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const dynamic = "force-dynamic"

/** Se o usuário atual já deu aura neste post — hidrata o estado inicial do botão no card. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, reaction: null })
  }

  const db = createSupabaseAdminClient()
  const { data: post } = await db.from("forum_posts").select("id").eq("slug", slug).maybeSingle()
  if (!post) {
    return NextResponse.json({ error: "Post não encontrado.", code: "not_found" }, { status: 404 })
  }

  const given = await getUserPostAuraReaction(user.id, post.id)
  return NextResponse.json({ ok: true, reaction: given ? "like" : null })
}

/** Dá ou remove (toggle) a aura do usuário atual num post — só "like", sem dislike. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para reagir.", code: "unauthenticated" }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "forum_post_aura",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de reagir novamente.", code: "rate_limited" }, { status: 429 })
  }

  const db = createSupabaseAdminClient()
  const { data: post } = await db
    .from("forum_posts")
    .select("id, is_hidden")
    .eq("slug", slug)
    .maybeSingle()

  if (!post || post.is_hidden) {
    return NextResponse.json({ error: "Post não encontrado.", code: "not_found" }, { status: 404 })
  }

  const result = await togglePostAura(user.id, post.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return NextResponse.json({ ok: true, reaction: result.reaction, aura_count: result.auraCount })
}
