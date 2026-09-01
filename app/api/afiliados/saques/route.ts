import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  cancelPayoutRequest,
  createPayoutRequest,
  getAffiliateByUserId,
  listOwnPayoutRequests,
} from "@/lib/server/repositories/affiliates-repository"
import {
  AFFILIATES_MAINTENANCE_MESSAGE,
  isAffiliatesBlockedByMaintenance,
} from "@/lib/server/auth/affiliate-access"
import { normalizePixKey, validatePixKey } from "@/lib/pix-key"

/**
 * A chave PIX é validada de verdade (dígito verificador de CPF/CNPJ, formato
 * de e-mail/celular/UUID), e não só por tamanho: uma chave inválida só
 * apareceria quando o admin fosse pagar, e uma chave VÁLIDA porém de outra
 * pessoa é dinheiro que não volta. O mesmo `validatePixKey` roda no
 * formulário, então o servidor aqui é a rede de baixo, não a primeira barreira.
 */
const bodySchema = z
  .object({
    amountCents: z.number().int().positive(),
    pixKey: z.string().trim().min(3).max(200),
    pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]),
  })
  .refine((data) => validatePixKey(data.pixKeyType, data.pixKey) === null, {
    message: "Chave PIX inválida para o tipo selecionado.",
    path: ["pixKey"],
  })

const cancelSchema = z.object({ payoutId: z.string().uuid() })

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
    const message = parsed.error.issues[0]?.message
    return NextResponse.json({ error: message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await createPayoutRequest(
    affiliate.id,
    parsed.data.amountCents,
    // Grava a chave normalizada (documento só com dígitos, celular com +55),
    // não o texto mascarado que a pessoa viu no input.
    normalizePixKey(parsed.data.pixKeyType, parsed.data.pixKey),
    parsed.data.pixKeyType
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}

/** Cancelamento de um saque ainda em análise, pelo próprio afiliado. */
export async function DELETE(request: NextRequest) {
  if (await isAffiliatesBlockedByMaintenance()) {
    return NextResponse.json({ error: AFFILIATES_MAINTENANCE_MESSAGE }, { status: 503 })
  }

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const affiliate = await getAffiliateByUserId(user.id)
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Você não é um afiliado aprovado." }, { status: 403 })
  }

  const parsed = cancelSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const result = await cancelPayoutRequest(affiliate.id, parsed.data.payoutId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
