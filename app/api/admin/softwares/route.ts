import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createSoftware } from "@/lib/server/repositories/softwares-repository"

import { softwarePayload } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Cadastro dos cards de /softwares. Usa as permissões de Marcas: cada card é
 * uma marca com logo e link, e quem cuida das marcas cuida disto.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_write")) {
    return NextResponse.json({ error: "Sem permissão para criar softwares." }, { status: 403 })
  }

  const parsed = softwarePayload.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await createSoftware(parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ software: result.software }, { status: 201 })
}
