import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  getPurchaseProfile,
  savePayerProfile,
  saveShippingProfile,
} from "@/lib/server/repositories/purchase-profile-repository"
import { parsePurchaseProfileUpdate } from "@/lib/server/validation/purchase-profile"

export const dynamic = "force-dynamic"

/**
 * Dados de compra em Minha conta (cobrança + entrega salvas no perfil).
 *
 * Fica sob `/api/profile/` e NÃO sob `/api/account/`: o proxy libera
 * `/api/account/*` para o WEB MASTER que ainda não ativou o 2FA (é o que a
 * aba Segurança carrega), e CPF/endereço não têm nada a ver com cadastrar o
 * segundo fator.
 *
 * Sessão "logado como" não lê nem grava: mesmo escopo mínimo de
 * `/api/store/checkout/payer-info` (LGPD Art. 6º, III).
 */
function impersonationResponse() {
  return NextResponse.json(
    { error: "impersonation_read_only", message: "Sessão de acesso é somente leitura." },
    { status: 403 }
  )
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  if (isImpersonating(request)) return impersonationResponse()

  const profile = await getPurchaseProfile(user.id)
  if (!profile) {
    return NextResponse.json({ error: "Não foi possível carregar seus dados." }, { status: 500 })
  }
  return NextResponse.json({ ...profile, email: user.email })
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  if (isImpersonating(request)) return impersonationResponse()

  const rateLimit = await checkRateLimit({
    action: "purchase_profile_update",
    identifier: user.id,
    maxAttempts: 20,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas alterações seguidas. Tente novamente mais tarde." },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = parsePurchaseProfileUpdate(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const result =
    parsed.update.kind === "payer"
      ? await savePayerProfile(user.id, parsed.update.payer)
      : await saveShippingProfile(user.id, parsed.update.shipping)
  if (!result.ok) {
    return NextResponse.json({ error: "Não foi possível salvar seus dados. Tente novamente." }, { status: 500 })
  }

  const profile = await getPurchaseProfile(user.id)
  return NextResponse.json({ ok: true, profile })
}
