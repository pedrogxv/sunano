import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"

const postSchema = z.object({
  title: z.string().trim().min(4).max(120),
  body: z.string().trim().min(20).max(5000),
  peripheral_refs: z.array(z.string().uuid()).max(3).optional().default([]),
})

function slugify(value: string) {
  return value
    .trim().toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .slice(0, 80).replace(/^-+|-+$/g, "")
}

async function createUniqueSlug(baseSlug: string) {
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase.from("forum_posts").select("slug").ilike("slug", `${baseSlug}%`)
  const taken = new Set(((data ?? []) as any[]).map((r: any) => r.slug))
  let slug = baseSlug
  let i = 2
  while (taken.has(slug)) { slug = `${baseSlug}-${i}`; i++ }
  return slug
}

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

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient()
    const url = new URL(request.url)
    const tab = url.searchParams.get("tab") ?? "recent" // recent | hot | peripheral
    const category = url.searchParams.get("category") ?? ""

    let query = supabase
      .from("forum_posts")
      .select("id, slug, title, body_preview, author_name, user_id, peripheral_refs, created_at, is_locked, is_pinned, vote_score")
      .eq("is_hidden", false)

    // Peripheral tab: filter by posts that have peripherals in the given category
    if (tab === "peripheral") {
      if (category) {
        const { data: perifs } = await supabase
          .from("peripherals").select("id").eq("category", category)
        const perifIds = ((perifs ?? []) as any[]).map((p: any) => p.id)
        if (!perifIds.length) return NextResponse.json({ ok: true, posts: [] })
        query = (query as any).overlaps("peripheral_refs", perifIds)
      } else {
        // Show all posts that have any peripheral ref
        query = (query as any).not("peripheral_refs", "eq", "{}")
      }
    }

    // Hot: restrict to last 30 days
    if (tab === "hot") {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      query = (query as any).gte("created_at", since)
    }

    // Always: pinned first, then by tab ordering
    query = (query as any).order("is_pinned", { ascending: false })
    if (tab === "hot") {
      query = (query as any).order("vote_score", { ascending: false })
    }
    query = (query as any).order("created_at", { ascending: false })

    const { data: posts, error } = await (query as any)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const postIds = ((posts ?? []) as any[]).map((p: any) => p.id)
    const commentCounts: Record<string, number> = {}
    const userIds: string[] = ((posts ?? []) as any[])
      .map((p: any) => p.user_id).filter(Boolean)

    if (postIds.length > 0) {
      const { data: comments } = await supabase
        .from("forum_comments").select("post_id").in("post_id", postIds).eq("is_hidden", false)
      for (const c of (comments ?? []) as any[]) {
        commentCounts[(c as any).post_id] = (commentCounts[(c as any).post_id] ?? 0) + 1
      }
    }

    const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await (supabase.from("user_profiles") as any)
        .select("id, display_name, avatar_url").in("id", userIds)
      for (const p of (profiles ?? []) as any[]) {
        profileMap[(p as any).id] = { display_name: (p as any).display_name, avatar_url: (p as any).avatar_url }
      }
    }

    const allRefs = ((posts ?? []) as any[]).flatMap((p: any) => p.peripheral_refs ?? [])
    const peripheralMap: Record<string, { name: string; brand: string; category: string; image_url: string | null }> = {}
    if (allRefs.length > 0) {
      const { data: perifs } = await supabase
        .from("peripherals").select("id, name, brand, category, image_url").in("id", [...new Set(allRefs)])
      for (const p of (perifs ?? []) as any[]) {
        peripheralMap[(p as any).id] = { name: (p as any).name, brand: (p as any).brand, category: (p as any).category, image_url: (p as any).image_url ?? null }
      }
    }

    const formatted = ((posts ?? []) as any[]).map((p: any) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      body: p.body_preview ?? "",
      author_name: p.author_name,
      user_id: p.user_id,
      peripheral_refs: p.peripheral_refs,
      created_at: p.created_at,
      is_locked: p.is_locked,
      is_pinned: p.is_pinned ?? false,
      vote_score: p.vote_score ?? 0,
      comment_count: commentCounts[p.id] ?? 0,
      author_display_name: p.user_id ? (profileMap[p.user_id]?.display_name ?? p.author_name) : p.author_name,
      author_avatar_url: p.user_id ? (profileMap[p.user_id]?.avatar_url ?? null) : null,
      peripherals: (p.peripheral_refs ?? []).map((id: string) => ({ id, ...peripheralMap[id] })).filter((r: any) => r.name),
    }))

    return NextResponse.json({ ok: true, posts: formatted })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar posts do forum." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userClient = createRouteClient(request)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para postar." }, { status: 401 })
    }

    const body = await request.json()
    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()

    const refs = parsed.data.peripheral_refs ?? []
    if (refs.length > 0) {
      const { data: perifs } = await supabase.from("peripherals").select("id").in("id", refs)
      if ((perifs ?? []).length !== refs.length) {
        return NextResponse.json({ error: "Um ou mais periféricos referenciados não existem." }, { status: 400 })
      }
    }

    const { data: profile } = await (supabase.from("user_profiles") as any)
      .select("display_name").eq("id", user.id).maybeSingle()
    const authorName = profile?.display_name || user.email?.split("@")[0] || "Usuário"

    const baseSlug = slugify(parsed.data.title) || `post-${Date.now()}`
    const slug = await createUniqueSlug(baseSlug)

    const { error } = await supabase.from("forum_posts").insert({
      slug,
      title: parsed.data.title.trim(),
      body: parsed.data.body.trim(),
      author_name: authorName,
      user_id: user.id,
      peripheral_refs: refs,
      is_hidden: false,
      is_locked: false,
    } as any)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, slug })
  } catch {
    return NextResponse.json({ error: "Erro ao criar post." }, { status: 500 })
  }
}
