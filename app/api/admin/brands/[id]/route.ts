import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission, isWebMaster } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { deleteBrand, updateBrand } from "@/lib/server/repositories/brands-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const brandPayload = z.object({
  name: z.string().min(1, "Nome é obrigatório.").max(120, "Nome muito longo (máx. 120 caracteres)."),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_write")) {
    return NextResponse.json({ error: "Sem permissão para editar marcas." }, { status: 403 })
  }

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)." }, { status: 400 })
  }

  const parsed = brandPayload.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await updateBrand(id, parsed.data.name)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ brand: result.brand })
}

/**
 * Exclusão de marca — exclusiva do WEB Master, sem exceções. `brands_write`
 * (leitura/edição) não é suficiente aqui, o mesmo padrão usado para exclusão
 * de usuários: a autorização é refeita do zero a cada chamada, nunca
 * delegada ao que a UI decide mostrar.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!isWebMaster(auth.profile)) {
    return NextResponse.json({ error: "Apenas o WEB Master pode excluir marcas." }, { status: 403 })
  }

  const { id } = await params

  const result = await deleteBrand(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
