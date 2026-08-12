import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { isOwnedCommentImageUrl, MAX_COMMENT_IMAGES, MAX_COMMENT_MENTIONS } from "@/lib/server/comment-media"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { addForumComment, listForumComments } from "@/lib/server/repositories/forum-repository"
import { getUserProfile, getUserProfiles } from "@/lib/server/repositories/users-repository"

const commentSchema = z
  .object({
    body: z.string().trim().max(2000),
    parentCommentId: z.string().uuid().nullable().optional(),
    imageUrls: z.array(z.string().url()).max(MAX_COMMENT_IMAGES).optional(),
    mentionedUserIds: z.array(z.string().uuid()).max(MAX_COMMENT_MENTIONS).optional(),
  })
  // Texto continua exigindo 4+ caracteres, mas uma imagem/gif anexado também basta.
  .refine((data) => data.body.length >= 4 || (data.imageUrls?.length ?? 0) > 0, {
    message: "Escreva ao menos 4 caracteres ou anexe uma imagem.",
    path: ["body"],
  })

/** Lista pública paginada dos comentários de um post do fórum (`?page=1&sort=recent|aura`). */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const searchParams = request.nextUrl.searchParams
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const sort = searchParams.get("sort") === "aura" ? "aura" : "recent"
  try {
    const result = await listForumComments(slug, { page, sort })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar comentários." }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para comentar." }, { status: 401 })
    }

    const parsed = commentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "forum_comment_create",
      identifier: user.id,
      maxAttempts: 20,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você comentou muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const imageUrls = parsed.data.imageUrls ?? []
    if (imageUrls.some((url) => !isOwnedCommentImageUrl(url, user.id))) {
      return NextResponse.json({ error: "Imagem inválida." }, { status: 400 })
    }

    const requestedMentionIds = [...new Set(parsed.data.mentionedUserIds ?? [])].filter(
      (id) => id !== user.id
    )
    const mentionedProfiles = requestedMentionIds.length
      ? await getUserProfiles(requestedMentionIds)
      : {}
    const mentionedUserIds = requestedMentionIds.filter((id) => mentionedProfiles[id])

    const profile = await getUserProfile(user.id)
    const authorName = profile?.display_name || user.email?.split("@")[0] || "Usuário"

    const result = await addForumComment({
      postSlug: slug,
      userId: user.id,
      authorName,
      body: parsed.data.body,
      parentCommentId: parsed.data.parentCommentId ?? null,
      imageUrls,
      mentionedUserIds,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar comentário." }, { status: 500 })
  }
}
