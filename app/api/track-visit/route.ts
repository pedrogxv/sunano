import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import {
  hashVisitor,
  recordVisit,
} from "@/lib/server/repositories/visits-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function safeTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Registra a visita do dia para o dashboard admin (ver visits-repository).
 * Chamada fire-and-forget pelo `proxy.ts` para visitantes anônimos em rotas
 * públicas — falha aqui nunca deve afetar a navegação do visitante, então
 * sempre responde 204 mesmo em erro (já logado no repositório).
 *
 * O único chamador legítimo é o próprio proxy, então a rota exige o segredo
 * interno que ele injeta. Sem isso ela era escrita anônima e ilimitada no
 * banco: como o hash do visitante deriva de IP + User-Agent, bastava variar o
 * User-Agent para gravar uma linha nova a cada POST, inflar `site_visits` e
 * falsear as métricas. O rate limit é a segunda camada, para o caso de o
 * segredo vazar.
 */
export async function POST(request: NextRequest) {
  const expectedToken = process.env.CRON_SECRET
  if (!expectedToken) {
    // Sem segredo configurado não há como distinguir o proxy de um terceiro.
    // Em produção isso recusa (fecha a escrita anônima); em dev segue aberto
    // para não exigir configuração local.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(null, { status: 204 })
    }
  } else {
    const providedToken = request.headers.get("x-internal-token") ?? ""
    if (!providedToken || !safeTokenMatch(providedToken, expectedToken)) {
      // 204 mesmo ao recusar: esta rota nunca informa o chamador sobre o
      // motivo, e um 401 aqui só serviria para alguém calibrar tentativas.
      return new NextResponse(null, { status: 204 })
    }
  }

  try {
    const forwardedFor = request.headers.get("x-forwarded-for")
    const ip =
      forwardedFor?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Teto por origem: o proxy já evita a chamada repetida via cookie
    // (`sn_visit_tracked`), então tráfego legítimo fica muito abaixo disso.
    const { allowed } = await checkRateLimit({
      action: "track_visit",
      identifier: getClientIdentifier(request),
      maxAttempts: 60,
      windowSeconds: 3600,
    })
    if (!allowed) {
      return new NextResponse(null, { status: 204 })
    }

    const visitorHash = hashVisitor(ip, userAgent)
    await recordVisit(visitorHash)
  } catch (error) {
    console.error("[api/track-visit]:", error)
  }

  return new NextResponse(null, { status: 204 })
}
