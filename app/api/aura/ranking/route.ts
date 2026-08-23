import { NextRequest, NextResponse } from "next/server"

import { getAuraRanking, type AuraRankingWindow } from "@/lib/server/repositories/aura-repository"

export const runtime = "nodejs"

const WINDOWS: AuraRankingWindow[] = ["all", "today", "week"]

/**
 * GET /api/aura/ranking?window=all|today|week — Top 10 de Aura da janela
 * pedida, para o modal "Ranking" da Central de Aura. Sem autenticação: é uma
 * lista pública, mesmo padrão de `/pessoas`. As janelas "today"/"week" já
 * vêm de `getAuraRanking` cacheadas (5 min) — esta rota não faz cache
 * próprio, só repassa.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("window")
  const window: AuraRankingWindow = WINDOWS.includes(raw as AuraRankingWindow)
    ? (raw as AuraRankingWindow)
    : "all"

  const entries = await getAuraRanking(window)
  return NextResponse.json({ window, entries })
}
