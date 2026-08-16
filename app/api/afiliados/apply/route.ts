import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { requestAffiliation } from "@/lib/server/repositories/affiliates-repository"

const bodySchema = z.object({
  pixKey: z.string().trim().min(3).max(200),
  pixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]),
})

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para solicitar afiliação." }, { status: 401 })
  }

  // Limite por userId (não por IP): é uma ação autenticada e o abuso relevante
  // é um único usuário reenviando solicitações, não múltiplos IPs.
  const rateLimit = await checkRateLimit({
    action: "affiliate_apply",
    identifier: user.id,
    maxAttempts: 3,
    windowSeconds: 86400,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas solicitações. Tente novamente mais tarde." }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const result = await requestAffiliation(user.id, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
