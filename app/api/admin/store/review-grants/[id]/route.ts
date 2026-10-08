import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { deleteReviewGrant } from "@/lib/server/repositories/store-review-grants-repository"

export const dynamic = "force-dynamic"

/** Revoga a liberação. A avaliação já feita com ela continua publicada. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Liberação não encontrada." }, { status: 404 })
  }

  try {
    await deleteReviewGrant(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao revogar a liberação.")
    return NextResponse.json(body, { status })
  }
}
