import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"

/**
 * Proxy pro ViaCEP: o CSP do site não libera `connect-src` pra domínios de
 * terceiros, então o autofill de endereço no checkout busca por aqui em vez
 * de bater direto no ViaCEP a partir do browser.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ cep: string }> }) {
  const { cep } = await params
  const digits = cep.replace(/\D/g, "")

  if (digits.length !== 8) {
    return NextResponse.json({ error: "CEP inválido." }, { status: 400 })
  }

  const identifier = getClientIdentifier(request)
  const { allowed } = await checkRateLimit({
    action: "cep_lookup",
    identifier,
    maxAttempts: 30,
    windowSeconds: 60,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente em instantes." }, { status: 429 })
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      return NextResponse.json({ error: "Não foi possível buscar o CEP." }, { status: 502 })
    }

    const data = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (data.erro) {
      return NextResponse.json({ error: "CEP não encontrado." }, { status: 404 })
    }

    return NextResponse.json({
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    })
  } catch {
    return NextResponse.json({ error: "Não foi possível buscar o CEP." }, { status: 502 })
  }
}
