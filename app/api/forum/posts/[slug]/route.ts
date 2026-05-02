import { NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"

type RouteParams = {
  params: { slug: string }
}

export async function GET(_: Request, { params }: RouteParams) {
  try {
    const supabase = createSupabaseAdminClient()

    const { data: post, error: postError } = await supabase
      .from("forum_posts")
      .select("id, slug, title, body, author_name, created_at, is_locked")
      .eq("slug", params.slug)
      .eq("is_hidden", false)
      .maybeSingle()

    if (postError) {
      return NextResponse.json({ error: postError.message }, { status: 400 })
    }

    if (!post) {
      return NextResponse.json({ error: "Post nao encontrado." }, { status: 404 })
    }

    const { data: comments } = await supabase
      .from("forum_comments")
      .select("id, body, author_name, created_at")
      .eq("post_id", post.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })

    return NextResponse.json({ ok: true, post, comments: comments ?? [] })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar post." }, { status: 500 })
  }
}
