import { NextResponse } from "next/server"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit"

const postSchema = z.object({
  title: z.string().trim().min(4).max(120),
  body: z.string().trim().min(20).max(5000),
  author_name: z.string().trim().min(2).max(60),
  author_email: z.string().trim().email().optional(),
  website: z.string().optional(),
})

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")

  return normalized.slice(0, 80).replace(/^-+|-+$/g, "")
}

async function createUniqueSlug(baseSlug: string) {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from("forum_posts")
    .select("slug")
    .ilike("slug", `${baseSlug}%`)

  const taken = new Set((data ?? []).map((item) => item.slug))
  let slug = baseSlug
  let index = 2

  while (taken.has(slug)) {
    slug = `${baseSlug}-${index}`
    index += 1
  }

  return slug
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: posts, error } = await supabase
      .from("forum_posts")
      .select("id, slug, title, body, author_name, created_at, is_locked")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const postIds = (posts ?? []).map((post) => post.id)
    const commentCounts: Record<string, number> = {}

    if (postIds.length > 0) {
      const { data: comments } = await supabase
        .from("forum_comments")
        .select("post_id")
        .in("post_id", postIds)
        .eq("is_hidden", false)

      for (const comment of comments ?? []) {
        commentCounts[comment.post_id] = (commentCounts[comment.post_id] ?? 0) + 1
      }
    }

    const formatted = (posts ?? []).map((post) => ({
      ...post,
      comment_count: commentCounts[post.id] ?? 0,
    }))

    return NextResponse.json({ ok: true, posts: formatted })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar posts do forum." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = postSchema.safeParse(body)

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
      action: "forum_post",
      identifier,
      maxAttempts: 3,
      windowSeconds: 3600,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Aguarde alguns minutos antes de publicar novamente." }, { status: 429 })
    }

    const baseSlug = slugify(parsed.data.title) || `post-${Date.now()}`
    const slug = await createUniqueSlug(baseSlug)

    const payload = {
      slug,
      title: parsed.data.title.trim(),
      body: parsed.data.body.trim(),
      author_name: parsed.data.author_name.trim(),
      author_email: parsed.data.author_email?.trim() || null,
      is_hidden: false,
      is_locked: false,
    }

    const { error } = await supabase.from("forum_posts").insert(payload)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, slug })
  } catch {
    return NextResponse.json({ error: "Erro ao criar post." }, { status: 500 })
  }
}
