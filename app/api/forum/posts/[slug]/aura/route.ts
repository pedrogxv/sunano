import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { toggleAura, type ReactionKind } from "@/lib/server/repositories/aura-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/** Dá, troca ou remove (toggle) a reação (like/dislike) do usuário atual num post. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para reagir." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const kind: ReactionKind = body?.kind === "dislike" ? "dislike" : "like"

  const rateLimit = await checkRateLimit({
    action: "forum_aura",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de reagir novamente." }, { status: 429 })
  }

  const db = createSupabaseAdminClient()
  const { data: post } = await db
    .from("forum_posts")
    .select("id, is_hidden")
    .eq("slug", slug)
    .maybeSingle()

  if (!post || post.is_hidden) {
    return NextResponse.json({ error: "Post não encontrado." }, { status: 404 })
  }

  const result = await toggleAura({ giverId: user.id, targetType: "post", targetId: post.id, kind })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, reaction: result.reaction, aura_count: result.auraCount })
}
