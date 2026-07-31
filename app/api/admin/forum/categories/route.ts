import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  createForumCategory,
  listForumCategoriesForAdmin,
} from "@/lib/server/repositories/forum-categories-repository"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  parentId: z.string().uuid().nullable(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  name: z.string().trim().min(2).max(60),
})

export async function GET() {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const categories = await listForumCategoriesForAdmin()
  return NextResponse.json({ ok: true, categories })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const result = await createForumCategory(parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, category: result.category })
}
