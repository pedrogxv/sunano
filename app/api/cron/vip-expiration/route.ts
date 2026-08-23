import { NextRequest, NextResponse } from "next/server"

import { expireVipAccounts } from "@/lib/server/repositories/vip-subscription-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

// Disparada pelo Vercel Cron (ver vercel.json). Mesmo padrão de
// /api/cron/expire-pending-orders: a Vercel injeta `Authorization: Bearer
// $CRON_SECRET` automaticamente em requisições de cron quando a env var
// CRON_SECRET está configurada — sem ela, a rota fica inacessível (fail
// closed, não aberta).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const expired = await expireVipAccounts()
  return NextResponse.json({ ok: true, expired })
}
