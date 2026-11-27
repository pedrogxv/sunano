import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  deleteStoreCampaign,
  getStoreCampaign,
  saveStoreCampaign,
} from "@/lib/server/repositories/store-campaigns-repository"

import { storeCampaignSchema } from "../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

const idSchema = z.uuid()

/** Uma campanha para o editor, com os produtos (inclusive pausados). */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão para ver as campanhas." }, { status: 403 })
  }

  const id = idSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })

  try {
    const campaign = await getStoreCampaign(id.data)
    if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
    return NextResponse.json({ campaign })
  } catch (error) {
    console.error("[api/admin/store-campaigns/[id]] GET:", error)
    return NextResponse.json({ error: "Erro ao carregar a campanha." }, { status: 500 })
  }
}

/** Grava a campanha inteira (textos, período e lista de produtos). */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para editar campanhas." }, { status: 403 })
  }

  const id = idSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })

  const parsed = storeCampaignSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await saveStoreCampaign({ ...parsed.data, id: id.data, adminId: auth.profile.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, id: result.id })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para apagar campanhas." }, { status: 403 })
  }

  const id = idSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })

  try {
    const deleted = await deleteStoreCampaign(id.data)
    if (!deleted) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[api/admin/store-campaigns/[id]] DELETE:", error)
    return NextResponse.json({ error: "Erro ao apagar a campanha." }, { status: 500 })
  }
}
