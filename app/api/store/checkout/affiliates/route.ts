import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { listCheckoutAffiliates } from "@/lib/server/repositories/affiliates-repository"
import { buildProfileMap } from "@/lib/server/repositories/profile-enrichment"
import { readAffiliateRefCookie } from "@/lib/server/affiliate-attribution"
import { profileFrameOf } from "@/lib/profile-frames"

export const dynamic = "force-dynamic"

/**
 * GET /api/store/checkout/affiliates
 *
 * Alimenta o seletor "Apoie um afiliado" do checkout: os afiliados aprovados
 * (nome, foto e moldura, para a pessoa reconhecer quem está escolhendo) e o
 * código que veio no link de indicação, para já abrir pré-selecionado.
 *
 * Só código e identidade pública. Comissão, saldo e chave PIX nunca saem
 * daqui: o comprador escolhe QUEM apoiar, não precisa saber quanto rende.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const rows = await listCheckoutAffiliates(user.id)
  const profiles = await buildProfileMap(rows.map((row) => row.user_id))

  const affiliates = rows
    .map((row) => {
      const profile = profiles[row.user_id]
      return {
        code: row.code,
        name: profile?.display_name?.trim() || row.code,
        avatarUrl: profile?.avatar_url ?? null,
        frame: profile ? profileFrameOf(profile) : null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  // Só pré-seleciona o que está na lista: um código de cookie que é do
  // próprio comprador, de afiliado suspenso ou banido não aparece no seletor.
  const cookieCode = readAffiliateRefCookie(request)
  const referredCode =
    cookieCode && affiliates.some((affiliate) => affiliate.code === cookieCode) ? cookieCode : null

  return NextResponse.json({ affiliates, referredCode })
}
