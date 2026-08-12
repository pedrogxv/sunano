import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { isOwnedCommentImageUrl, MAX_COMMENT_IMAGES, MAX_COMMENT_MENTIONS } from "@/lib/server/comment-media"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { deleteOwnBlogComment, updateBlogComment } from "@/lib/server/repositories/blog-repository"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"

// Mesmos limites do POST de criação — o texto editado passa pelas mesmas
// regras do original, senão dava pra escapar do mínimo/máximo editando depois.
const editSchema = z
  .object({
    body: z.string().trim().max(2000),
    imageUrls: z.array(z.string().url()).max(MAX_COMMENT_IMAGES).optional(),
    mentionedUserIds: z.array(z.string().uuid()).max(MAX_COMMENT_MENTIONS).optional(),
  })
  // Mesma regra do POST de criação: texto de 4+ caracteres OU ao menos uma imagem/gif.
  .refine((data) => data.body.length >= 4 || (data.imageUrls?.length ?? 0) > 0, {
    message: "Escreva ao menos 4 caracteres ou anexe uma imagem.",
    path: ["body"],
  })

/** Edita o próprio comentário, dentro da janela de 15 minutos (conferida no repositório). */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; commentId: string }> }
) {
  const { slug, commentId } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para editar." }, { status: 401 })
    }

    const parsed = editSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "blog_comment_edit",
      identifier: user.id,
      maxAttempts: 30,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você editou comentários muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    let imageUrls: string[] | undefined
    if (parsed.data.imageUrls !== undefined) {
      imageUrls = parsed.data.imageUrls
      if (imageUrls.some((url) => !isOwnedCommentImageUrl(url, user.id))) {
        return NextResponse.json({ error: "Imagem inválida." }, { status: 400 })
      }
    }

    let mentionedUserIds: string[] | undefined
    if (parsed.data.mentionedUserIds !== undefined) {
      const requestedMentionIds = [...new Set(parsed.data.mentionedUserIds)].filter((id) => id !== user.id)
      const mentionedProfiles = requestedMentionIds.length
        ? await getUserProfiles(requestedMentionIds)
        : {}
      mentionedUserIds = requestedMentionIds.filter((id) => mentionedProfiles[id])
    }

    const result = await updateBlogComment({
      postSlug: slug,
      commentId,
      userId: user.id,
      body: parsed.data.body,
      imageUrls,
      mentionedUserIds,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao editar comentário." }, { status: 500 })
  }
}

/** Exclui o próprio comentário — a checagem de autoria acontece no repositório, contra o banco. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string; commentId: string }> }
) {
  const { slug, commentId } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para excluir." }, { status: 401 })
    }

    const rateLimit = await checkRateLimit({
      action: "blog_comment_delete",
      identifier: user.id,
      maxAttempts: 30,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você excluiu comentários muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await deleteOwnBlogComment({ postSlug: slug, commentId, userId: user.id })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao excluir comentário." }, { status: 500 })
  }
}
