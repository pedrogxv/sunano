import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { listStoreCampaigns, saveStoreCampaign } from "@/lib/server/repositories/store-campaigns-repository"

import { storeCampaignSchema } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Todas as campanhas, para a lista do painel. */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver as campanhas." }, { status: 403 })
  }

  try {
    return NextResponse.json({ campaigns: await listStoreCampaigns() })
  } catch (error) {
    console.error("[api/admin/store-campaigns] GET:", error)
    return NextResponse.json({ error: "Erro ao carregar as campanhas." }, { status: 500 })
  }
}

/** Cria uma campanha. */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para criar campanhas." }, { status: 403 })
  }

  const parsed = storeCampaignSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await saveStoreCampaign({ ...parsed.data, id: null, adminId: auth.profile.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 })
}
