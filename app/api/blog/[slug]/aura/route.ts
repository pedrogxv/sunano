import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { toggleAura } from "@/lib/server/repositories/aura-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/** Dá ou remove (toggle) a aura do usuário atual numa notícia. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para dar aura." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "blog_aura",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de dar aura novamente." }, { status: 429 })
  }

  const db = createSupabaseAdminClient()
  const { data: post } = await db
    .from("blog_posts")
    .select("id, is_published")
    .eq("slug", slug)
    .maybeSingle()

  if (!post || !post.is_published) {
    return NextResponse.json({ error: "Notícia não encontrada." }, { status: 404 })
  }

  const result = await toggleAura({ giverId: user.id, targetType: "blog_post", targetId: post.id })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, given: result.given, aura_count: result.auraCount })
}
