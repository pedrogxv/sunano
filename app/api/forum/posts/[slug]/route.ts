import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  deleteForumPostBySlug,
  getForumPostBySlug,
  updateForumPost,
} from "@/lib/server/repositories/forum-repository"

const patchSchema = z
  .object({
    body: z.string().trim().min(20).max(5000).optional(),
    category_id: z.string().uuid().optional(),
    media_image_url: z.string().url().nullable().optional(),
    media_video_url: z.string().url().nullable().optional(),
    is_hidden: z.boolean().optional(),
    is_locked: z.boolean().optional(),
    is_pinned: z.boolean().optional(),
  })
  .refine((data) => !(data.media_image_url && data.media_video_url), {
    message: "Escolha apenas um tipo de mídia: imagem ou vídeo.",
  })

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  try {
    const result = await getForumPostBySlug(slug)
    if (!result) {
      return NextResponse.json({ error: "Post não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ ok: true, post: result.post, comments: result.comments })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar post." }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const result = await updateForumPost(slug, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const result = await deleteForumPostBySlug(slug)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
