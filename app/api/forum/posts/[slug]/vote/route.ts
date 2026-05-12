import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"

const voteSchema = z.object({
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
})

function createRouteClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )
}

export async function POST(request: NextRequest, context: any) {
  let params: { slug: string } | undefined = context?.params
  if (params && typeof (params as any).then === "function") {
    try { params = await params } catch { params = undefined }
  }
  if (!params?.slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 })

  const userClient = createRouteClient(request)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para votar." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = voteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Valor de voto inválido." }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  const { data: post } = await supabase
    .from("forum_posts")
    .select("id, is_hidden")
    .eq("slug", params.slug)
    .maybeSingle()

  if (!post || (post as any).is_hidden) {
    return NextResponse.json({ error: "Post não encontrado." }, { status: 404 })
  }

  const postId = (post as any).id
  const value = parsed.data.value

  if (value === 0) {
    await (supabase as any).from("forum_votes").delete()
      .eq("user_id", user.id).eq("post_id", postId)
  } else {
    await (supabase as any).from("forum_votes").upsert(
      { user_id: user.id, post_id: postId, value },
      { onConflict: "user_id,post_id" }
    )
  }

  const { data: updated } = await supabase
    .from("forum_posts").select("vote_score").eq("id", postId).maybeSingle()

  return NextResponse.json({ ok: true, vote_score: (updated as any)?.vote_score ?? 0 })
}
