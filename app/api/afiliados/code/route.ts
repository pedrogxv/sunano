import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { normalizeAffiliateCode, validateAffiliateCode } from "@/lib/affiliate-code"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { updateAffiliateCode } from "@/lib/server/repositories/affiliates-repository"

const bodySchema = z.object({
  code: z.string().trim().min(1).max(40),
})

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para alterar o código." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "affiliate_code_update",
    identifier: user.id,
    maxAttempts: 5,
    windowSeconds: 86400,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const code = normalizeAffiliateCode(parsed.data.code)
  const invalidCode = validateAffiliateCode(code)
  if (invalidCode) {
    return NextResponse.json({ error: invalidCode }, { status: 400 })
  }

  const result = await updateAffiliateCode(user.id, code)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
