import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { isWebMaster, type AdminProfile } from "@/lib/admin-permissions"
import { banAccount, unbanAccount } from "@/lib/server/repositories/account-ban-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

const banSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

const unbanSchema = z.object({
  userId: z.string().uuid(),
})

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/**
 * Ban geral de conta — exclusivo do WEB Master, mesmo padrão de autorização
 * de app/api/admin/users/[id]/route.ts (exclusão de usuário): a checagem é
 * refeita aqui do zero a cada chamada, nunca confiando no cliente. Impede
 * banir a própria conta ou um WEB Master, mesmas travas do delete.
 */
async function requireWebMaster() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return { error: NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 }) }
  }

  const { data: currentProfile } = await supabase
    .from("admin_profiles")
    .select("id, role, permissions")
    .eq("id", authData.user.id)
    .maybeSingle()

  const typedCurrentProfile = currentProfile as AdminProfile | null

  if (!typedCurrentProfile || !isWebMaster(typedCurrentProfile)) {
    return { error: NextResponse.json({ error: "Apenas o WEB Master pode banir usuários." }, { status: 403 }) }
  }

  return { actorId: authData.user.id }
}

export async function POST(request: NextRequest) {
  const auth = await requireWebMaster()
  if ("error" in auth) return auth.error

  const parsed = banSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  if (parsed.data.userId === auth.actorId) {
    return NextResponse.json({ error: "Você não pode banir a própria conta." }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()
  const { data: targetProfile } = await admin
    .from("admin_profiles")
    .select("role")
    .eq("id", parsed.data.userId)
    .maybeSingle()

  if ((targetProfile as { role?: string } | null)?.role === "webmaster") {
    return NextResponse.json({ error: "Uma conta WEB Master não pode ser banida." }, { status: 403 })
  }

  const result = await banAccount(parsed.data.userId, parsed.data.reason, {
    actorId: auth.actorId,
    ipAddress: getClientIp(request),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireWebMaster()
  if ("error" in auth) return auth.error

  const parsed = unbanSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const result = await unbanAccount(parsed.data.userId, {
    actorId: auth.actorId,
    ipAddress: getClientIp(request),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
