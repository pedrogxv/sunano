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

/**
 * Visitas: 400 dias, não 90.
 *
 * O prazo é ditado pelo painel, não por conforto: `getVisitSeries`
 * (lib/server/repositories/visits-repository.ts) monta uma série `year`
 * agrupada por mês, e o admin compara o ano corrente com o anterior. Cortar
 * em 90 dias esvaziaria esse gráfico silenciosamente — o dado sumiria sem
 * erro nenhum, que é a pior forma de quebrar um relatório.
 *
 * 400 dias cobrem o ano corrente inteiro mais a margem para a comparação
 * ano-a-ano, e ainda assim põem um teto no que hoje é a maior tabela do banco
 * (15k linhas e crescendo sem limite algum).
 *
 * `visitor_hash` já é pseudonimizado (SHA-256 de IP + UA + segredo, sem
 * cookie e sem PII bruta), então isto é minimização (Art. 6, III) sobre dado
 * que nunca foi identificável — não correção de um vazamento.
 */
const SITE_VISITS_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000

/**
 * Notificação já LIDA, passados 90 dias, não serve a ninguém: o usuário já
 * viu, e o sino só mostra as recentes. As não lidas ficam — some-las seria
 * apagar algo que a pessoa ainda não teve chance de ver, por mais antigo que
 * seja.
 */
const NOTIFICATIONS_READ_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export type LgpdPurgeResult = {
  rate_limit_events_deleted: number
  audit_log_deleted: number
  store_orders_deleted: number
  mfa_trusted_devices_deleted: number
  site_visits_deleted: number
  notifications_deleted: number
}

export async function purgeExpiredLgpdData(): Promise<LgpdPurgeResult> {
  const db = createSupabaseAdminClient()

  const rateLimitCutoff = new Date(Date.now() - RATE_LIMIT_EVENTS_MAX_AGE_MS).toISOString()
  const auditLogCutoff = new Date(Date.now() - AUDIT_LOG_MAX_AGE_MS).toISOString()
  const storeOrdersCutoff = new Date(Date.now() - STORE_ORDERS_MAX_AGE_MS).toISOString()
  const siteVisitsCutoff = new Date(Date.now() - SITE_VISITS_MAX_AGE_MS).toISOString()
  const notificationsCutoff = new Date(Date.now() - NOTIFICATIONS_READ_MAX_AGE_MS).toISOString()
  const now = new Date().toISOString()

  const [
    rateLimitResult,
    auditLogResult,
    storeOrdersResult,
    mfaTrustedDevicesResult,
    siteVisitsResult,
    notificationsResult,
  ] = await Promise.all([
    db.from("rate_limit_events").delete({ count: "exact" }).lt("created_at", rateLimitCutoff),
    db.from("audit_log").delete({ count: "exact" }).lt("created_at", auditLogCutoff),
    db.from("store_orders").delete({ count: "exact" }).lt("created_at", storeOrdersCutoff),
    // "Lembrar dispositivo" (lib/server/repositories/mfa-trusted-devices-repository.ts):
    // token já vencido não serve pra mais nada — minimização de dados (LGPD Art. 6, III).
    db.from("mfa_trusted_devices").delete({ count: "exact" }).lt("expires_at", now),
    // `visited_date` (date), não `created_at`: é a coluna que o painel agrupa,
    // e a que define de fato a idade da visita.
    db.from("site_visits").delete({ count: "exact" }).lt("visited_date", siteVisitsCutoff.slice(0, 10)),
    // Só as já lidas — ver NOTIFICATIONS_READ_MAX_AGE_MS.
    db
      .from("notifications")
      .delete({ count: "exact" })
      .eq("is_read", true)
      .lt("created_at", notificationsCutoff),
  ])

  return {
    rate_limit_events_deleted: rateLimitResult.count ?? 0,
    audit_log_deleted: auditLogResult.count ?? 0,
    store_orders_deleted: storeOrdersResult.count ?? 0,
    mfa_trusted_devices_deleted: mfaTrustedDevicesResult.count ?? 0,
    site_visits_deleted: siteVisitsResult.count ?? 0,
    notifications_deleted: notificationsResult.count ?? 0,
  }
}
