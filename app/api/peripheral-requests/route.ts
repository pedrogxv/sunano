import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, refundRateLimitAttempt } from "@/lib/server/rate-limit"
import { createPeripheralRequest, listMyPeripheralRequests } from "@/lib/server/repositories/peripheral-requests-repository"
import { PERIPHERAL_REQUEST_LIMITS } from "@/lib/peripheral-requests"
import { ALL_CATEGORIES } from "@/lib/tag-options"

/** Lista/cria os pedidos de cadastro de periférico da pessoa logada. */

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const page = Number(url.searchParams.get("page")) || 1
  const pageSize = Number(url.searchParams.get("pageSize")) || 20

  const result = await listMyPeripheralRequests(user.id, page, pageSize)
  return NextResponse.json(result)
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

const createRequestSchema = z.object({
  category: z.enum(ALL_CATEGORIES as [string, ...string[]], { message: "Escolha a categoria." }),
  brandName: z
    .string()
    .trim()
    .min(1, "Informe a marca.")
    .max(PERIPHERAL_REQUEST_LIMITS.brand, `A marca deve ter no máximo ${PERIPHERAL_REQUEST_LIMITS.brand} caracteres.`),
  modelName: z
    .string()
    .trim()
    .min(2, "Informe o modelo.")
    .max(PERIPHERAL_REQUEST_LIMITS.model, `O modelo deve ter no máximo ${PERIPHERAL_REQUEST_LIMITS.model} caracteres.`),
  referenceUrl: z
    .string()
    .trim()
    .max(PERIPHERAL_REQUEST_LIMITS.url, "O link é longo demais.")
    .refine((value) => value === "" || isHttpUrl(value), "Link inválido. Use um endereço que comece com http:// ou https://.")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(PERIPHERAL_REQUEST_LIMITS.notes, `As observações devem ter no máximo ${PERIPHERAL_REQUEST_LIMITS.notes} caracteres.`)
    .optional(),
})

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "peripheral_request_create",
    identifier: user.id,
    maxAttempts: 10,
    windowSeconds: 86400,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Você atingiu o limite de pedidos de hoje. Tente novamente amanhã." },
      { status: 429 }
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = createRequestSchema.safeParse(json)
  if (!parsed.success) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await createPeripheralRequest({
    userId: user.id,
    category: parsed.data.category as (typeof ALL_CATEGORIES)[number],
    brandName: parsed.data.brandName,
    modelName: parsed.data.modelName,
    referenceUrl: parsed.data.referenceUrl || null,
    notes: parsed.data.notes || null,
  })

  if (!result.ok) {
    await refundRateLimitAttempt(rateLimit.attemptId)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, requestId: result.requestId, number: result.number })
}
