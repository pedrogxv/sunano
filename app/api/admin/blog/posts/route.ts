import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "blog_read")) {
    return NextResponse.json({ error: "Sem permissão para ler blog." }, { status: 403 })
  }

  const db = createSupabaseAdminClient()
  const select = (withType: boolean) =>
    db
      .from("blog_posts")
      .select(
        `id, title, slug, ${withType ? "post_type, " : ""}excerpt, cover_thumbnail_url, cover_image_url, is_published, created_at, peripherals(name, brand)`
      )
      .order("created_at", { ascending: false })

  let { data, error } = await select(true)
  if (error && error.message.includes("post_type")) {
    ({ data, error } = await select(false))
  }

  if (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar artigos.")
    return NextResponse.json(body, { status })
  }

  return NextResponse.json({ posts: data ?? [] })
}
