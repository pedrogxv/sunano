import { NextRequest, NextResponse } from "next/server"

import { purgeExpiredLgpdData } from "@/lib/server/repositories/lgpd-repository"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"

// Disparada pelo Vercel Cron (ver vercel.json). A Vercel injeta
// `Authorization: Bearer $CRON_SECRET` automaticamente em requisições de
// cron quando a env var CRON_SECRET está configurada no projeto — sem ela
// configurada, a rota fica inacessível (falha fechada, não aberta).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await purgeExpiredLgpdData()
  return NextResponse.json({ ok: true, ...result })
}
