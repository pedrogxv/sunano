import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  createPayoutRequest,
  getAffiliateByUserId,
  listOwnPayoutRequests,
} from "@/lib/server/repositories/affiliates-repository"
import {
  AFFILIATES_MAINTENANCE_MESSAGE,
  isAffiliatesBlockedByMaintenance,
} from "@/lib/server/auth/affiliate-access"

const bodySchema = z.object({
  amountCents: z.number().int().positive(),
  pixKey: z.string().trim().min(3).max(200),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]),
})

export async function GET(request: NextRequest) {
  // Segunda checagem da mesma regra que o proxy já aplica (proxy.ts) — fechado
  // por padrão, caso o matcher/lógica do proxy mude e esta rota deixe de passar
  // por lá. WEB MASTER ignora a manutenção, igual na Loja.
  if (await isAffiliatesBlockedByMaintenance()) {
    return NextResponse.json({ error: AFFILIATES_MAINTENANCE_MESSAGE }, { status: 503 })
  }

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const affiliate = await getAffiliateByUserId(user.id)
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Você não é um afiliado aprovado." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("pageSize")) || 20

  const result = await listOwnPayoutRequests(affiliate.id, page, pageSize)
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  // Segunda checagem da mesma regra que o proxy já aplica (proxy.ts) — fechado
  // por padrão, caso o matcher/lógica do proxy mude e esta rota deixe de passar
  // por lá. WEB MASTER ignora a manutenção, igual na Loja.
  if (await isAffiliatesBlockedByMaintenance()) {
    return NextResponse.json({ error: AFFILIATES_MAINTENANCE_MESSAGE }, { status: 503 })
  }

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const affiliate = await getAffiliateByUserId(user.id)
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Você não é um afiliado aprovado." }, { status: 403 })
  }

  const rateLimit = await checkRateLimit({
    action: "affiliate_payout_request",
    identifier: user.id,
    maxAttempts: 5,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas solicitações de saque. Tente novamente mais tarde." }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const result = await createPayoutRequest(
    affiliate.id,
    parsed.data.amountCents,
    parsed.data.pixKey,
    parsed.data.pixKeyType
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
