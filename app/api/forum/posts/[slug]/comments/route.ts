import { NextResponse } from "next/server"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit"

type RouteParams = {
  params: { slug: string }
}

const commentSchema = z.object({
  body: z.string().trim().min(4).max(2000),
  author_name: z.string().trim().min(2).max(60),
  author_email: z.string().trim().email().optional(),
  website: z.string().optional(),
})

export async function POST(request: Request, context: any) {
  let params: { slug: string } | undefined = context?.params
  if (params && typeof (params as any).then === "function") {
    try {
      params = await params
    } catch (_) {
      params = undefined
    }
  }
  if (!params?.slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 })
  }
  try {
    const body = await request.json()
    const parsed = commentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    if (parsed.data.website && parsed.data.website.trim().length > 0) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const identifier = getClientIdentifier(request)
    const rateLimit = await checkRateLimit({
      supabase,
      action: "forum_comment",
      identifier,
      maxAttempts: 10,
      windowSeconds: 3600,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Aguarde alguns minutos antes de comentar novamente." }, { status: 429 })
    }

    const { data: post, error: postError } = await supabase
      .from("forum_posts")
      .select("id, is_locked")
      .eq("slug", params.slug)
      .maybeSingle()

    if (postError) {
      return NextResponse.json({ error: postError.message }, { status: 400 })
    }

    if (!post) {
      return NextResponse.json({ error: "Post nao encontrado." }, { status: 404 })
    }

    if ((post as any).is_locked) {
      return NextResponse.json({ error: "Este post esta fechado para comentarios." }, { status: 403 })
    }

    const payload = {
      post_id: (post as any).id,
      body: parsed.data.body.trim(),
      author_name: parsed.data.author_name.trim(),
      author_email: parsed.data.author_email?.trim() || null,
      is_hidden: false,
    }

    const { error } = await (supabase.from("forum_comments").insert(payload as any) as any)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar comentario." }, { status: 500 })
  }
}
