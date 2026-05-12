import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"

const commentSchema = z.object({
  body: z.string().trim().min(4).max(2000),
  peripheral_refs: z.array(z.string().uuid()).max(3).optional().default([]),
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

  try {
    // Auth required
    const userClient = createRouteClient(request)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para comentar." }, { status: 401 })
    }

    const body = await request.json()
    const parsed = commentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    // Validate peripheral_refs
    const refs = parsed.data.peripheral_refs ?? []
    if (refs.length > 0) {
      const { data: perifs } = await supabase.from("peripherals").select("id").in("id", refs)
      if ((perifs ?? []).length !== refs.length) {
        return NextResponse.json({ error: "Um ou mais periféricos referenciados não existem." }, { status: 400 })
      }
    }

    const { data: post, error: postError } = await supabase
      .from("forum_posts")
      .select("id, is_locked")
      .eq("slug", params.slug)
      .maybeSingle()

    if (postError) return NextResponse.json({ error: postError.message }, { status: 400 })
    if (!post) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 })
    if ((post as any).is_locked) {
      return NextResponse.json({ error: "Este post está fechado para comentários." }, { status: 403 })
    }

    // Get author name from user profile
    const { data: profile } = await (supabase.from("user_profiles") as any)
      .select("display_name").eq("id", user.id).maybeSingle()
    const authorName = profile?.display_name || user.email?.split("@")[0] || "Usuário"

    const { error } = await supabase.from("forum_comments").insert({
      post_id: (post as any).id,
      body: parsed.data.body.trim(),
      author_name: authorName,
      user_id: user.id,
      peripheral_refs: refs,
      is_hidden: false,
    } as any)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar comentário." }, { status: 500 })
  }
}
