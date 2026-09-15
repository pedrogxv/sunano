import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  deleteSoftware,
  getSoftwareById,
  updateSoftware,
} from "@/lib/server/repositories/softwares-repository"
import { removeImageIfUnreferenced, removeReplacedStorageObjects } from "@/lib/server/storage-cleanup"

import { softwarePayload } from "../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_write")) {
    return NextResponse.json({ error: "Sem permissão para editar softwares." }, { status: 403 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Software inválido." }, { status: 400 })
  }

  const parsed = softwarePayload.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const current = await getSoftwareById(id)
  if (!current) {
    return NextResponse.json({ error: "Software não encontrado." }, { status: 404 })
  }

  const result = await updateSoftware(id, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  await removeReplacedStorageObjects([current.logoUrl], [result.software.logoUrl])
  return NextResponse.json({ software: result.software })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_write")) {
    return NextResponse.json({ error: "Sem permissão para excluir softwares." }, { status: 403 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Software inválido." }, { status: 400 })
  }

  const result = await deleteSoftware(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  await removeImageIfUnreferenced(result.logoUrl, "softwares", "logo_url")
  return NextResponse.json({ ok: true })
}
