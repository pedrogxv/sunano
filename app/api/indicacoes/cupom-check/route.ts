import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"

import { REFERRAL_COOKIE, normalizeReferralCode, validateReferralCode } from "@/lib/referral-code"
import { getReferrerPublicName } from "@/lib/server/repositories/referrals-repository"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"

export const dynamic = "force-dynamic"

/**
 * GET /api/indicacoes/cupom-check?code=CUPOM
 *
 * Confirma um cupom de indicação DURANTE O CADASTRO, mostrando o nome de quem
 * indicou ("Você foi indicado por Fulano"). Sem isso a pessoa só descobre que
 * digitou errado depois de criar a conta — quando não dá mais para corrigir,
 * já que cada usuário só pode ser indicado uma vez.
 *
 * Aberta a anônimos por necessidade: quem digita o cupom ainda não tem conta.
 * Isso a torna um vetor de enumeração — alguém poderia varrer códigos para
 * mapear quem indica quem, ou achar códigos válidos para farmar. Duas
 * defesas:
 *
 *   1. Rate limit por IP (mais apertado que o do cadastro: aqui um humano
 *      digita um cupom, não trinta).
 *   2. A resposta devolve só o nome PÚBLICO de exibição — o mesmo que
 *      aparece em qualquer post do fórum. Nunca id, e-mail ou contadores.
 */
export async function GET(request: Request) {
  try {
    const headersList = await headers()
    const rateLimit = await checkRateLimit({
      action: "referral_code_check",
      identifier: getClientIdentifierFromHeaders(headersList),
      maxAttempts: 20,
      windowSeconds: 600,
      // `open`: falha do limiter não pode impedir alguém de conferir o cupom
      // durante um cadastro legítimo. O dano de deixar passar aqui é ínfimo
      // (leitura de um nome público), ao contrário do cadastro em si.
      onError: "open",
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Muitas verificações. Aguarde um instante." },
        { status: 429 }
      )
    }

    // Sem `code` na query, cai no cookie `sn_inv_ref`. É assim que o campo
    // descobre o cupom quando o cadastro acontece pelo AuthModal (que abre em
    // qualquer página do site, não só em /register): o cookie é httpOnly, então
    // um componente de cliente não consegue lê-lo sozinho, e sem este fallback
    // toda indicação feita pelo modal se perderia.
    const cookieStore = await cookies()
    const raw =
      new URL(request.url).searchParams.get("code") ?? cookieStore.get(REFERRAL_COOKIE)?.value ?? ""
    const code = normalizeReferralCode(raw)
    if (!code) {
      return NextResponse.json({ ok: true, code: "", valid: false, referrerName: null })
    }

    const invalid = validateReferralCode(code)
    if (invalid) {
      return NextResponse.json({ ok: true, code, valid: false, referrerName: null, error: invalid })
    }

    const referrerName = await getReferrerPublicName(code)
    return NextResponse.json({
      ok: true,
      code,
      valid: Boolean(referrerName),
      referrerName,
      error: referrerName ? null : "Cupom não encontrado. Confira com quem te indicou.",
    })
  } catch {
    return NextResponse.json({ error: "Erro ao verificar o cupom." }, { status: 500 })
  }
}
