import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createBrand, listBrands } from "@/lib/server/repositories/brands-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const brandPayload = z.object({
  name: z.string().min(1, "Nome é obrigatório.").max(120, "Nome muito longo (máx. 120 caracteres)."),
})

export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_read")) {
    return NextResponse.json({ error: "Sem permissão para ler marcas." }, { status: 403 })
  }

  const brands = await listBrands()
  return NextResponse.json({ brands })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_write")) {
    return NextResponse.json({ error: "Sem permissão para criar marcas." }, { status: 403 })
  }

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

  const result = await createBrand(parsed.data.name)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ brand: result.brand }, { status: 201 })
}
