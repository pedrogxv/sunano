import { NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

const blogPostSchema = z
  .object({
    id: z.string().optional(),
    post_type: z.enum(["news", "review"]).default("review"),
    peripheral_id: z.string().nullable().optional(),
    title: z.string().min(5, "Título deve ter no mínimo 5 caracteres"),
    excerpt: z.string().nullable().optional(),
    cover_image_url: z.string().nullable().optional(),
    cover_thumbnail_url: z.string().nullable().optional(),
    video_url: z.string().nullable().optional(),
    content: z.string().min(20, "Conteúdo deve ter no mínimo 20 caracteres"),
    is_published: z.boolean(),
  })
  .superRefine((data, ctx) => {
    // Reviews exigem periférico; notícias não.
    if (data.post_type === "review" && !data.peripheral_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["peripheral_id"],
        message: "Selecione um periférico",
      })
    }
  })

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function generateRandomSuffix() {
  const randomBytes = new Uint8Array(4)
  crypto.getRandomValues(randomBytes)
  return Array.from(randomBytes, (value) => value.toString(16).padStart(2, "0")).join("")
}

function calculateReadTimeMinutes(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return 1

  const words = trimmed.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

async function generateUniqueSlug(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, title: string) {
  const baseSlug = slugify(title) || "review"

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${baseSlug}-${generateRandomSuffix()}`
    const { data: existing, error } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!existing) {
      return candidate
    }
  }

  return `${baseSlug}-${Date.now()}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = blogPostSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json(
        { error: "Sessão expirada. Entre novamente no admin." },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from("admin_profiles")
      .select("id, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    if (!profile || !hasAdminPermission(profile, "blog_write")) {
      return NextResponse.json({ error: "Sem permissão para salvar artigos." }, { status: 403 })
    }

    const profileEnsurePayload: Record<string, unknown> = {
      id: authData.user.id,
      email: authData.user.email ?? null,
      display_name: null,
      avatar_url: null,
    }

    const { error: profileEnsureError } = await supabase.from("admin_profiles").upsert(
      profileEnsurePayload as any,
      { onConflict: "id", ignoreDuplicates: true }
    )

    if (profileEnsureError && !profileEnsureError.message.includes("admin_profiles")) {
      const { body, status } = dbErrorResponse(profileEnsureError, "Erro ao validar perfil do admin.")
      return NextResponse.json(body, { status })
    }

    const payload = {
      post_type: parsed.data.post_type,
      peripheral_id: parsed.data.post_type === "review" ? parsed.data.peripheral_id : null,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt?.trim() || null,
      cover_image_url:
        parsed.data.cover_image_url?.trim() || parsed.data.cover_thumbnail_url?.trim() || null,
      cover_thumbnail_url:
        parsed.data.cover_thumbnail_url?.trim() || parsed.data.cover_image_url?.trim() || null,
      read_time_minutes: calculateReadTimeMinutes(parsed.data.content),
      video_url: parsed.data.video_url?.trim() || null,
      content: parsed.data.content,
      is_published: parsed.data.is_published,
    }

    const payloadWithAuthor = {
      ...payload,
      author_id: authData.user.id,
    }

    const payloadWithoutThumbnail = {
      peripheral_id: payload.peripheral_id,
      title: payload.title,
      excerpt: payload.excerpt,
      cover_image_url: payload.cover_image_url,
      read_time_minutes: payload.read_time_minutes,
      video_url: payload.video_url,
      content: payload.content,
      is_published: payload.is_published,
    }

    const payloadWithoutReadTime = {
      peripheral_id: payload.peripheral_id,
      title: payload.title,
      excerpt: payload.excerpt,
      cover_image_url: payload.cover_image_url,
      cover_thumbnail_url: payload.cover_thumbnail_url,
      video_url: payload.video_url,
      content: payload.content,
      is_published: payload.is_published,
    }

    const payloadWithoutReadTimeOrThumbnail = {
      peripheral_id: payload.peripheral_id,
      title: payload.title,
      excerpt: payload.excerpt,
      cover_image_url: payload.cover_image_url,
      video_url: payload.video_url,
      content: payload.content,
      is_published: payload.is_published,
    }

    const payloadWithoutAuthor = {
      ...payload,
    }

    const payloadWithoutThumbnailOrAuthor = {
      ...payloadWithoutThumbnail,
    }

    const isMissingColumnError = (message: string | null | undefined, column: string) =>
      Boolean(message && message.includes(column))

    let result = parsed.data.id
      ? await (supabase.from("blog_posts") as any).update(payload as any).eq("id", parsed.data.id)
      : await (supabase.from("blog_posts") as any).insert([
          { ...payloadWithAuthor, slug: await generateUniqueSlug(supabase, parsed.data.title) },
        ])

    // Fallback: migração `blog_post_type.sql` ainda não aplicada. Reviews
    // continuam funcionando sem a coluna; notícias exigem a migração.
    if (isMissingColumnError(result.error?.message, "post_type")) {
      const payloadNoType = { ...payload } as Record<string, unknown>
      delete payloadNoType.post_type
      const payloadWithAuthorNoType = { ...payloadWithAuthor } as Record<string, unknown>
      delete payloadWithAuthorNoType.post_type
      result = parsed.data.id
        ? await (supabase.from("blog_posts") as any).update(payloadNoType as any).eq("id", parsed.data.id)
        : await (supabase.from("blog_posts") as any).insert([
            { ...payloadWithAuthorNoType, slug: await generateUniqueSlug(supabase, parsed.data.title) },
          ])
    }

    if (isMissingColumnError(result.error?.message, "cover_thumbnail_url")) {
      result = parsed.data.id
        ? await (supabase.from("blog_posts") as any).update(payloadWithoutThumbnail as any).eq("id", parsed.data.id)
        : await (supabase.from("blog_posts") as any).insert([
            { ...payloadWithoutThumbnail, slug: await generateUniqueSlug(supabase, parsed.data.title) },
          ])
    }

    if (isMissingColumnError(result.error?.message, "author_id")) {
      result = parsed.data.id
        ? await (supabase.from("blog_posts") as any).update(payloadWithoutAuthor as any).eq("id", parsed.data.id)
        : await (supabase.from("blog_posts") as any).insert([
            { ...payloadWithoutAuthor, slug: await generateUniqueSlug(supabase, parsed.data.title) },
          ])
    }

    if (isMissingColumnError(result.error?.message, "read_time_minutes")) {
      // For updates, always include read_time_minutes calculation
      const insertPayload = parsed.data.id
        ? payload // Use full payload with read_time_minutes for updates
        : { ...payloadWithoutReadTime, author_id: authData.user.id }

      result = parsed.data.id
        ? await (supabase.from("blog_posts") as any).update(insertPayload as any).eq("id", parsed.data.id)
        : await (supabase.from("blog_posts") as any).insert([
            { ...insertPayload, slug: await generateUniqueSlug(supabase, parsed.data.title) },
          ])
    }

    if (isMissingColumnError(result.error?.message, "read_time_minutes") && isMissingColumnError(result.error?.message, "cover_thumbnail_url")) {
      // For updates, create a payload without thumbnail but WITH read_time_minutes
      const payloadForThisCase = {
        peripheral_id: payload.peripheral_id,
        title: payload.title,
        excerpt: payload.excerpt,
        cover_image_url: payload.cover_image_url,
        read_time_minutes: payload.read_time_minutes,
        video_url: payload.video_url,
        content: payload.content,
        is_published: payload.is_published,
      }

      const insertPayload = parsed.data.id
        ? payloadForThisCase
        : { ...payloadWithoutReadTimeOrThumbnail, author_id: authData.user.id }

      result = parsed.data.id
        ? await (supabase.from("blog_posts") as any).update(insertPayload as any).eq("id", parsed.data.id)
        : await (supabase.from("blog_posts") as any).insert([
            { ...insertPayload, slug: await generateUniqueSlug(supabase, parsed.data.title) },
          ])
    }

    if (isMissingColumnError(result.error?.message, "cover_thumbnail_url") && isMissingColumnError(result.error?.message, "author_id")) {
      result = parsed.data.id
        ? await (supabase.from("blog_posts") as any).update(payloadWithoutThumbnailOrAuthor as any).eq("id", parsed.data.id)
        : await (supabase.from("blog_posts") as any).insert([
            { ...payloadWithoutThumbnailOrAuthor, slug: await generateUniqueSlug(supabase, parsed.data.title) },
          ])
    }

    if (result.error) {
      const { body, status } = dbErrorResponse(result.error, "Erro ao salvar artigo.")
      return NextResponse.json(body, { status })
    }

    const savedId = Array.isArray(result.data) ? result.data[0]?.id : result.data?.id

    return NextResponse.json({ ok: true, id: savedId ?? parsed.data.id ?? null })
  } catch {
    return NextResponse.json(
      { error: "Erro inesperado ao salvar artigo." },
      { status: 500 }
    )
  }
}