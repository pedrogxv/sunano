import { NextResponse } from "next/server"

import { normalizeAffiliateCode, validateAffiliateCode } from "@/lib/affiliate-code"
import { getAffiliateByUserId, isAffiliateCodeAvailable } from "@/lib/server/repositories/affiliates-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

/**
 * GET /api/afiliados/code-check?code=MEUCODIGO
 *
 * Diz se o código está livre enquanto a pessoa digita, para o conflito não
 * aparecer só na hora de enviar a solicitação. A garantia continua sendo o
 * índice único do banco (`affiliates.code`) — isto aqui é conveniência de UI.
 * Se o próprio usuário já tem uma solicitação (ex.: reenvio após rejeição),
 * o código atual dele não se autobloqueia.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const rawCode = new URL(request.url).searchParams.get("code") ?? ""
    const code = normalizeAffiliateCode(rawCode)

    const invalid = validateAffiliateCode(code)
    if (invalid) {
      return NextResponse.json({ ok: true, code, available: false, error: invalid })
    }

    const existing = await getAffiliateByUserId(authData.user.id)
    const available = await isAffiliateCodeAvailable(code, existing?.id)
    return NextResponse.json({
      ok: true,
      code,
      available,
      error: available ? null : "Esse código já está em uso. Escolha outro.",
    })
  } catch {
    return NextResponse.json({ error: "Erro ao verificar o código." }, { status: 500 })
  }
}
