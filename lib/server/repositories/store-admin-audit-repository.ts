import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Log de auditoria para ações administrativas críticas da Loja (deletar
 * produto, avançar/estornar pedido). O autor (`adminId`) vem sempre da
 * sessão resolvida no backend (getAuthorizedProfile) — nunca de dado enviado
 * pelo frontend. Falha ao gravar o log nunca derruba a ação principal (a
 * ação já aconteceu; perder o registro de auditoria é preferível a bloquear
 * ou reverter algo que já foi feito).
 */
export type StoreAuditAction = "product.delete" | "order.advance" | "order.refund"

type LogAdminActionParams = {
  adminId: string
  action: StoreAuditAction
  entityType: "store_product" | "store_order"
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_admin_audit_log").insert({
    admin_id: params.adminId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    before: params.before ?? null,
    after: params.after ?? null,
  })
  if (error) {
    console.error("[store-admin-audit-repository] logAdminAction:", error)
  }
}

export type StoreAuditLogEntry = {
  id: string
  admin_id: string | null
  admin_display_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

/**
 * Lista as entradas mais recentes do log, com o nome do admin resolvido.
 *
 * Busca os nomes à parte (não via embed do PostgREST) — `store_admin_audit_log`
 * é uma tabela nova demais para o relacionamento já estar refletido no
 * `database.types.ts` gerado, e duas queries simples evitam depender disso.
 */
export async function listStoreAuditLog(limit = 100): Promise<StoreAuditLogEntry[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_admin_audit_log")
    .select("id, admin_id, action, entity_type, entity_id, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200))

  if (error) {
    console.error("[store-admin-audit-repository] listStoreAuditLog:", error)
    return []
  }

  const rows = data ?? []
  const adminIds = [...new Set(rows.map((row) => row.admin_id).filter((id): id is string => id != null))]
  const nameById = new Map<string, string | null>()
  if (adminIds.length > 0) {
    const { data: admins } = await db.from("admin_profiles").select("id, display_name").in("id", adminIds)
    for (const admin of admins ?? []) nameById.set(admin.id, admin.display_name)
  }

  return rows.map((row) => ({
    id: row.id,
    admin_id: row.admin_id,
    admin_display_name: row.admin_id ? nameById.get(row.admin_id) ?? null : null,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    before: row.before,
    after: row.after,
    created_at: row.created_at,
  }))
}
