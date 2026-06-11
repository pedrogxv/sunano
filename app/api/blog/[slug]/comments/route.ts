import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { addBlogComment, listBlogComments } from "@/lib/server/repositories/blog-repository"
import { getUserProfile } from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

const commentSchema = z.object({
  body: z.string().trim().min(2).max(2000),
})

/** Lista pública dos comentários de uma notícia. */
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  try {
    const comments = await listBlogComments(slug)
    return NextResponse.json({ ok: true, comments })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar comentários." }, { status: 500 })
  }
}

/** Cria um comentário — exige usuário autenticado (conta). */
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json(
        { error: "Você precisa estar logado para comentar." },
        { status: 401 }
      )
    }

    const parsed = commentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const profile = await getUserProfile(user.id)
    const authorName = profile?.display_name || user.email?.split("@")[0] || "Usuário"

    const result = await addBlogComment({
      postSlug: slug,
      userId: user.id,
      authorName,
      body: parsed.data.body,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar comentário." }, { status: 500 })
  }
}
