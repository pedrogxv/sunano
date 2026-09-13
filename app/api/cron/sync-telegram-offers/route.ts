import { NextRequest, NextResponse } from "next/server"

import { syncTelegramOffers } from "@/lib/server/integrations/telegram-offers"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Mantém `offers_cache` em dia sem depender de visita à página.
 *
 * Sem este cron, o histórico só é alimentado quando alguém abre `/offers` —
 * uma janela longa sem acesso deixa buracos permanentes, porque as mensagens
 * que saem das ~30 últimas do canal não são mais alcançáveis pelo scraping.
 *
 * `syncTelegramOffers` pula a busca se uma visita já atualizou nos últimos
 * 5 min, então os dois caminhos convivem sem trabalho duplicado: em página
 * movimentada o cron quase sempre sai por "fresh" (uma query de índice, sem
 * fetch externo); em página parada ele assume o trabalho.
 *
 * Auth: mesmo padrão de /api/cron/vip-expiration — a Vercel injeta
 * `Authorization: Bearer $CRON_SECRET` automaticamente quando a env var existe.
 * Sem ela a rota fica inacessível (fail closed).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await syncTelegramOffers()
  return NextResponse.json({ ok: true, ...result })
}
