import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "blog_read")) {
    return NextResponse.json({ error: "Sem permissão para ler blog." }, { status: 403 })
  }

  const { id } = await params

  const db = createSupabaseAdminClient()
  const select = (withType: boolean) =>
    db
      .from("blog_posts")
      .select(
        `id, title, slug, ${withType ? "post_type, " : ""}peripheral_id, excerpt, cover_image_url, cover_thumbnail_url, video_url, content, is_published`
      )
      .eq("id", id)
      .maybeSingle()

  let { data, error } = await select(true)
  if (error && error.message.includes("post_type")) {
    ({ data, error } = await select(false))
  }

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao buscar artigo.")
    return NextResponse.json(body, { status })
  }
  if (!data) {
    return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 })
  }

  return NextResponse.json({ post: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "blog_write")) {
    return NextResponse.json({ error: "Sem permissão para deletar artigos." }, { status: 403 })
  }

  const { id } = await params

  const db = createSupabaseAdminClient()
  const { error } = await db.from("blog_posts").delete().eq("id", id)

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao deletar artigo.")
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ ok: true })
}
