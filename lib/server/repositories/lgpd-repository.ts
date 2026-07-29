import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Purga dados retidos além do prazo declarado na Política de Privacidade
 * (app/privacidade/page.tsx, seção 5). Chamada pela rota de cron
 * (app/api/cron/lgpd-cleanup/route.ts).
 *
 * `rate_limit_events` precisa sobreviver ao maior `windowSeconds` em uso
 * (hoje 3600s, em app/register/actions.ts e afins) — do contrário o
 * throttling perde efeito, já que checkRateLimit só conta linhas dentro da
 * janela. Por isso a purga usa 2h, não os 5min que a política antes
 * prometia (ajustado nesta mesma mudança para bater com o que o código faz).
 */
const RATE_LIMIT_EVENTS_MAX_AGE_MS = 2 * 60 * 60 * 1000
const AUDIT_LOG_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000
// Art. 16, II — cessa a obrigação legal/fiscal que justifica reter pedidos
// (app/privacidade/page.tsx, seção 5: "retidos por até 5 anos").
const STORE_ORDERS_MAX_AGE_MS = 5 * 365 * 24 * 60 * 60 * 1000

export type LgpdPurgeResult = {
  rate_limit_events_deleted: number
  audit_log_deleted: number
  store_orders_deleted: number
}

export async function purgeExpiredLgpdData(): Promise<LgpdPurgeResult> {
  const db = createSupabaseAdminClient()

  const rateLimitCutoff = new Date(Date.now() - RATE_LIMIT_EVENTS_MAX_AGE_MS).toISOString()
  const auditLogCutoff = new Date(Date.now() - AUDIT_LOG_MAX_AGE_MS).toISOString()
  const storeOrdersCutoff = new Date(Date.now() - STORE_ORDERS_MAX_AGE_MS).toISOString()

  const [rateLimitResult, auditLogResult, storeOrdersResult] = await Promise.all([
    db.from("rate_limit_events").delete({ count: "exact" }).lt("created_at", rateLimitCutoff),
    db.from("audit_log").delete({ count: "exact" }).lt("created_at", auditLogCutoff),
    db.from("store_orders").delete({ count: "exact" }).lt("created_at", storeOrdersCutoff),
  ])

  return {
    rate_limit_events_deleted: rateLimitResult.count ?? 0,
    audit_log_deleted: auditLogResult.count ?? 0,
    store_orders_deleted: storeOrdersResult.count ?? 0,
  }
}
