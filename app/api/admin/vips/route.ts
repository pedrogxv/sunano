import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  getVipAdminTotals,
  listVipsForAdmin,
  type VipAdminFilter,
} from "@/lib/server/repositories/vip-admin-repository"
import { searchUserProfiles } from "@/lib/server/repositories/users-repository"
import { VIP_PLANS } from "@/lib/vip-plan"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/admin/vips — listagem e métricas do painel de VIPs.
 *
 * `?users=<termo>` é um atalho para o autocomplete do campo de concessão
 * manual (reusa a busca de perfis já existente), no mesmo endpoint para não
 * multiplicar rotas — mesmo padrão de `/api/admin/aura-itens/purchases`.
 *
 * Permissão: `vip_read`.
 */
const FILTERS: VipAdminFilter[] = [
  "active_vips",
  "subscribers",
  "past_due",
  "pending",
  "aura_or_manual",
  "canceled",
  "all",
]

const querySchema = z.object({
  filter: z.enum(FILTERS as [VipAdminFilter, ...VipAdminFilter[]]).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  users: z.string().trim().min(2).max(60).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "vip_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos." },
      { status: 400 }
    )
  }

  // Atalho: autocomplete de usuário para a concessão manual. `includeOwner`
  // porque aqui o admin procura QUALQUER conta, inclusive as que ficam fora
  // das listagens públicas — é uma tela administrativa, não um diretório.
  if (parsed.data.users) {
    const results = await searchUserProfiles(parsed.data.users, 8, { includeOwner: true })
    return NextResponse.json({
      users: results.map((user) => ({
        id: user.id,
        displayName: user.display_name?.trim() || `Membro ${user.id.slice(0, 6)}`,
        displaySlug: user.display_slug,
        avatarUrl: user.avatar_url,
      })),
    })
  }

  try {
    const [list, totals] = await Promise.all([
      listVipsForAdmin({
        filter: parsed.data.filter ?? "active_vips",
        search: parsed.data.search ?? null,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      }),
      getVipAdminTotals(),
    ])

    return NextResponse.json({
      ok: true,
      ...list,
      totals,
      // Catálogo inteiro: a tela mostra os dois preços e o MRR já vem
      // mensalizado dos dois planos.
      plans: Object.values(VIP_PLANS).map((plan) => ({
        period: plan.period,
        priceCents: plan.priceCents,
        months: plan.months,
        label: plan.label,
        unitLabel: plan.unitLabel,
      })),
      // A UI esconde as ações de escrita para quem só tem leitura (hoje o
      // `vendedor`). É COSMÉTICO — quem manda é o guard das rotas de escrita
      // (`authorizeVipWrite`); isto só evita oferecer um botão que vai dar 403.
      canWrite: hasAdminPermission(auth.profile, "vip_write"),
    })
  } catch (err) {
    console.error("[admin/vips] listagem falhou:", err)
    return NextResponse.json({ error: "Não foi possível carregar os VIPs." }, { status: 500 })
  }
}
