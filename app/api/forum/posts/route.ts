import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { isAllowedForumImageUrl } from "@/lib/server/forum-media"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  createForumPost,
  hasForumPostsByUser,
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
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(5000).optional(),
    category_id: z.string().uuid(),
    media_image_urls: z.array(z.string().url()).max(5).optional(),
    media_video_url: z
      .string()
      .url()
      .refine((url) => YOUTUBE_HOST_RE.test(new URL(url).hostname), {
        message: "O link de vídeo precisa ser do YouTube.",
      })
      .optional(),
  })
  .refine((data) => !(data.media_image_urls?.length && data.media_video_url), {
    message: "Escolha apenas um tipo de mídia: imagem ou vídeo.",
  })

const VALID_TABS: ForumTab[] = ["recent", "hot", "category", "mine", "user"]

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)

    // Checagem leve pra decidir se a aba "Meus Posts" aparece — não carrega
    // a lista inteira, só um `count`.
    if (url.searchParams.get("hasPosts") === "1") {
      const user = await getRequestUser(request)
      if (!user) return NextResponse.json({ ok: true, hasPosts: false })
      const hasPosts = await hasForumPostsByUser(user.id)
      return NextResponse.json({ ok: true, hasPosts })
    }

    const tabParam = url.searchParams.get("tab") ?? "recent"
    const tab: ForumTab = VALID_TABS.includes(tabParam as ForumTab)
      ? (tabParam as ForumTab)
      : "recent"
    const categoryId = url.searchParams.get("categoryId") ?? undefined
    const pageParam = Number(url.searchParams.get("page") ?? "1")
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

    let userId: string | undefined
    if (tab === "mine") {
      const user = await getRequestUser(request)
      if (!user) {
        return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
      }
      userId = user.id
    } else if (tab === "user") {
      // Posts de um autor específico — modal "Posts" na vitrine pública do
      // perfil dele. Não exige sessão: é a mesma listagem que qualquer
      // visitante já vê espalhada pelo fórum, só filtrada por autor.
      userId = url.searchParams.get("userId") ?? undefined
      if (!userId) {
        return NextResponse.json({ error: "Usuário não informado." }, { status: 400 })
      }
    }

    const { posts, hasMore } = await listForumPosts({ tab, categoryId, userId, page })
    return NextResponse.json({ ok: true, posts, hasMore })
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

    const mediaImageUrls = parsed.data.media_image_urls ?? []
    if (mediaImageUrls.some((url) => !isAllowedForumImageUrl(url, user.id))) {
      return NextResponse.json({ error: "Imagem inválida." }, { status: 400 })
    }

    const profile = await getUserProfile(user.id)
    const authorName = profile?.display_name || user.email?.split("@")[0] || "Usuário"

    const result = await createForumPost({
      userId: user.id,
      authorName,
      title: parsed.data.title,
      body: parsed.data.body,
      categoryId: parsed.data.category_id,
      mediaImageUrls,
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
