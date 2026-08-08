import { NextRequest, NextResponse } from "next/server"

import { hashVisitor, recordVisit } from "@/lib/server/repositories/visits-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Registra a visita do dia para o dashboard admin (ver visits-repository).
 * Chamada fire-and-forget pelo `proxy.ts` para visitantes anônimos em rotas
 * públicas — falha aqui nunca deve afetar a navegação do visitante, então
 * sempre responde 204 mesmo em erro (já logado no repositório).
 */
export async function POST(request: NextRequest) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const visitorHash = hashVisitor(ip, userAgent)
    await recordVisit(visitorHash)
  } catch (error) {
    console.error("[api/track-visit]:", error)
  }

  return new NextResponse(null, { status: 204 })
}
