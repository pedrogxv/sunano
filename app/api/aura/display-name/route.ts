import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { auraPriceForVip } from "@/lib/aura-pricing"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile-name"
import { getUserAuraBalance } from "@/lib/server/repositories/aura-repository"
import {
  changeDisplayNameWithAura,
  getDisplayNameChangeCost,
  getDisplayNameCooldown,
  getVipStatus,
} from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  name: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
})

/**
 * GET /api/aura/display-name — saldo, cooldown e **preço** da troca, para o
 * modal se preparar ao abrir.
 *
 * O preço vem daqui (catálogo + tier do usuário) em vez de ser constante no
 * client: fora da Central de Aura o modal não recebia o item nem o tier, e
 * acabava anunciando o valor cheio para VIP, que a RPC cobra com 10% off.
 * Só prévia de exibição — quem debita é `change_display_name_with_aura`.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const [balance, cooldown, listPrice, vip] = await Promise.all([
    getUserAuraBalance(user.id),
    getDisplayNameCooldown(user.id),
    getDisplayNameChangeCost(),
    getVipStatus(user.id),
  ])

  return NextResponse.json({
    ok: true,
    balance,
    cooldown,
    isVip: vip.active,
    // `null` quando o item saiu do catálogo — o modal bloqueia a troca.
    price: listPrice === null ? null : auraPriceForVip(listPrice, vip.active),
  })
}

/** POST /api/aura/display-name — troca o nome pagando Aura (preço do catálogo, com desconto VIP aplicado pela RPC), sujeito a cooldown de 3 dias. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (a primeira é o
  // proxy, que recusa toda escrita). Trocar o apelido de outra pessoa gasta a Aura dela e queima o cooldown.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível alterar o nome de exibição.",
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Nome inválido." }, { status: 400 })
  }

  const result = await changeDisplayNameWithAura(user.id, parsed.data.name)

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, cooldownEndsAt: result.cooldownEndsAt ?? null },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, displayName: result.displayName, displaySlug: result.displaySlug })
}
