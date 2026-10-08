import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { profileMediaProxyUrl } from "@/lib/account-tier"
import { dbErrorResponse } from "@/lib/db-errors"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  createReviewGrants,
  GrantInputError,
  listReviewGrantsForAdmin,
} from "@/lib/server/repositories/store-review-grants-repository"
import { listAdminUsersPaginated } from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * Liberações de avaliação para cliente antigo. `?users=<termo>` é o
 * autocomplete do campo de conta (nome ou e-mail), no mesmo endpoint para não
 * multiplicar rotas (mesmo padrão de `/api/admin/vips?users=`).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const term = new URL(request.url).searchParams.get("users")?.trim()
  if (term !== undefined) {
    if (term.length < 2 || term.length > 80) return NextResponse.json({ users: [] })
    try {
      const { users } = await listAdminUsersPaginated({ search: term, pageSize: 8 })
      return NextResponse.json({
        users: users
          .filter((u) => u.has_profile && !u.account_banned_at)
          .map((u) => ({
            id: u.id,
            displayName: u.display_name?.trim() || `Membro ${u.id.slice(0, 6)}`,
            email: u.email,
            avatarUrl: u.avatar_url ? profileMediaProxyUrl(u.id, "avatar") : null,
          })),
      })
    } catch {
      return NextResponse.json({ users: [] })
    }
  }

  try {
    return NextResponse.json({ grants: await listReviewGrantsForAdmin() })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao listar liberações.")
    return NextResponse.json(body, { status })
  }
}

const createSchema = z.object({
  userId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1, "Escolha pelo menos um produto.").max(50),
  note: z.string().trim().max(200).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const result = await createReviewGrants({
      userId: parsed.data.userId,
      productIds: parsed.data.productIds,
      grantedBy: auth.profile.id,
      note: parsed.data.note || null,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof GrantInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const { body, status } = dbErrorResponse(error, "Erro ao liberar a avaliação.")
    return NextResponse.json(body, { status })
  }
}
