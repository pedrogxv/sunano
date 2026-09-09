import { NextRequest, NextResponse } from "next/server"

import { normalizeReferralCode, validateReferralCode } from "@/lib/referral-code"
import { setReferralCode } from "@/lib/server/repositories/referrals-repository"
import { getRequestUser } from "@/lib/server/auth/current-user"

export const dynamic = "force-dynamic"

const MESSAGES: Record<string, string> = {
  taken: "Esse código já está em uso. Escolha outro.",
  already_customized: "Você já personalizou seu código uma vez.",
  not_found: "Seu código ainda não foi gerado. Recarregue a página.",
  invalid: "Código inválido.",
  error: "Não foi possível salvar o código. Tente novamente.",
}

/**
 * PATCH /api/indicacoes/code — personaliza o código de indicação.
 *
 * Vale UMA VEZ (o banco impõe via `customized_at`). Não é capricho: links já
 * compartilhados por aí param de funcionar a cada troca, e um código
 * liberado repetidamente permitiria "passar adiante" um código bonito.
 */
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
  }

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
  }

  const code = normalizeReferralCode(body.code ?? "")
  const invalid = validateReferralCode(code)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }

  const result = await setReferralCode(user.id, code)
  if (result !== "ok") {
    return NextResponse.json(
      { error: MESSAGES[result] ?? MESSAGES.error },
      { status: result === "taken" || result === "already_customized" ? 409 : 400 }
    )
  }

  return NextResponse.json({ ok: true, code })
}
