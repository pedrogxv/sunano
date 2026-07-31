import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  createForumPost,
  listForumPosts,
  type ForumTab,
} from "@/lib/server/repositories/forum-repository"
import { getUserProfile } from "@/lib/server/repositories/users-repository"

/**
 * Endpoint do fórum. Toda a lógica de banco vive no `forum-repository`;
 * esta rota apenas valida a entrada, autentica e formata a resposta.
 */

const YOUTUBE_HOST_RE = /^(www\.)?(youtube\.com|youtu\.be)$/i

const postSchema = z
  .object({
    body: z.string().trim().min(20).max(5000),
    category_id: z.string().uuid(),
    media_image_url: z.string().url().optional(),
    media_video_url: z
      .string()
      .url()
      .refine((url) => YOUTUBE_HOST_RE.test(new URL(url).hostname), {
        message: "O link de vídeo precisa ser do YouTube.",
      })
      .optional(),
  })
  .refine((data) => !(data.media_image_url && data.media_video_url), {
    message: "Escolha apenas um tipo de mídia: imagem ou vídeo.",
  })

const VALID_TABS: ForumTab[] = ["recent", "hot", "category"]

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const tabParam = url.searchParams.get("tab") ?? "recent"
    const tab: ForumTab = VALID_TABS.includes(tabParam as ForumTab)
      ? (tabParam as ForumTab)
      : "recent"
    const categoryId = url.searchParams.get("categoryId") ?? undefined

    const posts = await listForumPosts({ tab, categoryId })
    return NextResponse.json({ ok: true, posts })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar posts do forum." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para postar." }, { status: 401 })
    }

    const parsed = postSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "forum_post_create",
      identifier: user.id,
      maxAttempts: 5,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você criou muitos posts recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const profile = await getUserProfile(user.id)
    const authorName = profile?.display_name || user.email?.split("@")[0] || "Usuário"

    const result = await createForumPost({
      userId: user.id,
      authorName,
      body: parsed.data.body,
      categoryId: parsed.data.category_id,
      mediaImageUrl: parsed.data.media_image_url ?? null,
      mediaVideoUrl: parsed.data.media_video_url ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, slug: result.slug })
  } catch {
    return NextResponse.json({ error: "Erro ao criar post." }, { status: 500 })
  }
}
