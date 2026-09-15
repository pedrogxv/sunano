import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit, getClientIpIdentifier } from "@/lib/server/rate-limit"
import { recordSoftwareClick } from "@/lib/server/repositories/softwares-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/softwares/:id/click: conta um clique para "Mais usados".
 *
 * Disparado por `navigator.sendBeacon` ao abrir o Web Hub, então ninguém lê
 * a resposta. O visitante é o hash do IP, sem User-Agent (que o cliente troca
 * à vontade), e a PK da tabela guarda no máximo um clique por visitante,
 * software e dia. Quem divide IP (CG-NAT) conta como um só: para um ranking
 * isso é aceitável, inflar o topo com cliques repetidos não é.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 400 })

  const visitor = getClientIpIdentifier(request)
  const rateLimit = await checkRateLimit({
    action: "software_click",
    identifier: visitor,
    maxAttempts: 30,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) return new NextResponse(null, { status: 429 })

  await recordSoftwareClick(id, visitor)
  return new NextResponse(null, { status: 204 })
}
