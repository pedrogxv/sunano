import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"

const patchSchema = z.object({
  title: z.string().trim().min(4).max(120).optional(),
  body: z.string().trim().min(20).max(5000).optional(),
  peripheral_refs: z.array(z.string().uuid()).max(3).optional(),
  is_hidden: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  is_pinned: z.boolean().optional(),
})

export async function GET(_: Request, context: any) {
  let params: { slug: string } | undefined = context?.params
  if (params && typeof (params as any).then === "function") {
    try { params = await params } catch { params = undefined }
  }
  if (!params?.slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 })

  try {
    const supabase = createSupabaseAdminClient()

    const { data: post, error: postError } = await supabase
      .from("forum_posts")
      .select("id, slug, title, body, author_name, user_id, peripheral_refs, created_at, is_locked, is_pinned, vote_score")
      .eq("slug", params.slug)
      .eq("is_hidden", false)
      .maybeSingle()

    if (postError) return NextResponse.json({ error: postError.message }, { status: 400 })
    if (!post) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 })

    const { data: comments } = await supabase
      .from("forum_comments")
      .select("id, body, author_name, user_id, peripheral_refs, created_at")
      .eq("post_id", (post as any).id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })

    // Collect user_ids to fetch profiles
    const userIds = [
      (post as any).user_id,
      ...((comments ?? []) as any[]).map((c: any) => c.user_id),
    ].filter(Boolean) as string[]

    const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    if (userIds.length > 0) {
      const uniqueIds = [...new Set(userIds)]
      const { data: profiles } = await supabase
        .from("user_profiles").select("id, display_name, avatar_url").in("id", uniqueIds)
      for (const p of (profiles ?? []) as any[]) {
        profileMap[(p as any).id] = { display_name: (p as any).display_name, avatar_url: (p as any).avatar_url }
      }
    }

    // Fetch peripheral info for refs
    const allRefs = [
      ...((post as any).peripheral_refs ?? []),
      ...((comments ?? []) as any[]).flatMap((c: any) => c.peripheral_refs ?? []),
    ]
    const peripheralMap: Record<string, { name: string; brand: string; category: string; image_url: string | null }> = {}
    if (allRefs.length > 0) {
      const { data: perifs } = await supabase
        .from("peripherals").select("id, name, brand, category, image_url").in("id", [...new Set(allRefs)])
      for (const p of (perifs ?? []) as any[]) {
        peripheralMap[(p as any).id] = { name: (p as any).name, brand: (p as any).brand, category: (p as any).category, image_url: (p as any).image_url ?? null }
      }
    }

    const enrichedPost = {
      ...(post as any),
      author_display_name: (post as any).user_id
        ? (profileMap[(post as any).user_id]?.display_name ?? (post as any).author_name)
        : (post as any).author_name,
      author_avatar_url: (post as any).user_id ? (profileMap[(post as any).user_id]?.avatar_url ?? null) : null,
      peripherals: ((post as any).peripheral_refs ?? []).map((id: string) => ({ id, ...peripheralMap[id] })).filter((p: any) => p.name),
    }

    const enrichedComments = ((comments ?? []) as any[]).map((c: any) => ({
      ...c,
      author_display_name: c.user_id ? (profileMap[c.user_id]?.display_name ?? c.author_name) : c.author_name,
      author_avatar_url: c.user_id ? (profileMap[c.user_id]?.avatar_url ?? null) : null,
      peripherals: (c.peripheral_refs ?? []).map((id: string) => ({ id, ...peripheralMap[id] })).filter((p: any) => p.name),
    }))

    return NextResponse.json({ ok: true, post: enrichedPost, comments: enrichedComments })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar post." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: any) {
  let params: { slug: string } | undefined = context?.params
  if (params && typeof (params as any).then === "function") {
    try { params = await params } catch { params = undefined }
  }
  if (!params?.slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 })

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from("forum_posts").select("id").eq("slug", params.slug).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 })

  if (parsed.data.peripheral_refs !== undefined) {
    const refs = parsed.data.peripheral_refs
    if (refs.length > 0) {
      const { data: perifs } = await supabase.from("peripherals").select("id").in("id", refs)
      if ((perifs ?? []).length !== refs.length) {
        return NextResponse.json({ error: "Um ou mais periféricos referenciados não existem." }, { status: 400 })
      }
    }
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) updates.title = parsed.data.title
  if (parsed.data.body !== undefined) updates.body = parsed.data.body
  if (parsed.data.peripheral_refs !== undefined) updates.peripheral_refs = parsed.data.peripheral_refs
  if (parsed.data.is_hidden !== undefined) updates.is_hidden = parsed.data.is_hidden
  if (parsed.data.is_locked !== undefined) updates.is_locked = parsed.data.is_locked
  if (parsed.data.is_pinned !== undefined) updates.is_pinned = parsed.data.is_pinned

  const { error } = await (supabase.from("forum_posts") as any)
    .update(updates).eq("id", (existing as any).id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
