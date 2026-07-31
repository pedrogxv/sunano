import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  deleteForumCategory,
  updateForumCategory,
} from "@/lib/server/repositories/forum-categories-repository"

const patchSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen.")
    .optional(),
  name: z.string().trim().min(2).max(60).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

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

  const result = await updateForumCategory(id, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, category: result.category })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const result = await deleteForumCategory(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
