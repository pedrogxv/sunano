import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  listReferralsForAdmin,
  reviewReferral,
  type ReferralStatus,
} from "@/lib/server/repositories/referrals-repository"

const VALID_STATUSES: ReferralStatus[] = ["pending", "validated", "rejected", "expired"]

/**
 * GET /api/admin/indicacoes — fila de indicações.
 *
 * `onlyCapped=1` traz só as barradas por teto (mesma casa/rede, ou limite por
 * usuário): são as únicas em que alguém legítimo pode ter sido pego junto, e
 * por isso a aba padrão do painel.
 *
 * Reusa a permissão `affiliates_read`/`affiliates_write` em vez de criar um
 * par novo: quem cuida de um programa de indicação cuida do outro, e criar
 * permissão nova exigiria migration + reconfigurar todo mundo que já
 * administra afiliados.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "affiliates_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get("status")
  const status = VALID_STATUSES.includes(statusParam as ReferralStatus)
    ? (statusParam as ReferralStatus)
    : undefined

  const referrals = await listReferralsForAdmin({
    status,
    onlyCapped: searchParams.get("onlyCapped") === "1",
    limit: Number(searchParams.get("limit")) || 100,
  })

  return NextResponse.json({ referrals })
}

/** PATCH /api/admin/indicacoes — aprova ou rejeita uma indicação à mão. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "affiliates_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  let body: { referredUserId?: string; approve?: boolean; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
  }

  if (!body.referredUserId || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 })
  }

  const result = await reviewReferral({
    referredUserId: body.referredUserId,
    approve: body.approve,
    adminId: auth.profile.id,
    reason: body.reason ?? null,
  })

  if (result === "error" || result === "no_referral") {
    return NextResponse.json({ error: "Não foi possível atualizar a indicação." }, { status: 400 })
  }

  return NextResponse.json({ ok: true, result })
}
