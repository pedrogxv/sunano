import { NextRequest, NextResponse } from "next/server"

import { expireStalePendingOrders } from "@/lib/server/repositories/orders-repository"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

// Disparada pelo Vercel Cron (ver vercel.json). Mesmo padrão de
// /api/cron/lgpd-cleanup: a Vercel injeta `Authorization: Bearer
// $CRON_SECRET` automaticamente em requisições de cron quando a env var
// CRON_SECRET está configurada — sem ela, a rota fica inacessível (fail
// closed, não aberta).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await expireStalePendingOrders()
  return NextResponse.json({ ok: true, ...result })
}
