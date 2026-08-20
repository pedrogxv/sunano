import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { getAdminRoleRank } from "@/lib/admin-permissions"
import { listStoreAuditLog } from "@/lib/server/repositories/store-admin-audit-repository"

/**
 * Leitura do log de auditoria de ações críticas da Loja (deletar produto,
 * avançar/estornar pedido, mudar preço). Restrito a Web Master/Admin — mais
 * alto que `store_write`, já que é justamente onde se investiga abuso de
 * quem tem `store_write`.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (getAdminRoleRank(auth.profile.role) > getAdminRoleRank("admin")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 200)

  const entries = await listStoreAuditLog(limit)
  return NextResponse.json({ entries })
}
