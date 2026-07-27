import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getTierlistMeta, updateTierlistMeta } from "@/lib/server/repositories/tierlist-meta-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const payloadSchema = z.object({
  latestUpdateDescription: z.string().trim().min(1, "Informe a descrição.").max(500, "Texto muito longo (máx. 500 caracteres)."),
})

export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "tiers_read")) {
    return NextResponse.json({ error: "Sem permissão para ler essas informações." }, { status: 403 })
  }

  const meta = await getTierlistMeta()
  return NextResponse.json({ meta })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "tiers_write")) {
    return NextResponse.json({ error: "Sem permissão para editar essas informações." }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const meta = await updateTierlistMeta(parsed.data)
    return NextResponse.json({ ok: true, meta })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar." }, { status: 500 })
  }
}
