import { NextResponse } from "next/server"
import * as z from "zod"

import { isWebMaster, type AdminProfile } from "@/lib/admin-permissions"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { getStoreSettings, updateStoreSettings } from "@/lib/server/repositories/store-settings-repository"

const storeSettingsSchema = z.object({
  cardSurchargePercent: z.number("Percentual inválido.").min(0).max(100),
  cardMaxInstallments: z.number("Número de parcelas inválido.").int().min(1).max(6),
})

// Configuração financeira: restrita ao Web Master, mesmo padrão do card de
// trocar senha em app/admin/settings/page.tsx (role check direto, não uma
// permission key da matriz — é sensível o bastante pra ficar fora dela).
async function requireWebMaster() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) return { ok: false as const, status: 401, error: "Sessão expirada. Entre novamente no admin." }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, email, display_name, avatar_url, role, permissions")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (!isWebMaster(profile as AdminProfile | null)) {
    return { ok: false as const, status: 403, error: "Apenas o Web Master pode ver/editar esta configuração." }
  }

  return { ok: true as const, adminId: authData.user.id }
}

export async function GET() {
  const auth = await requireWebMaster()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const settings = await getStoreSettings()
  return NextResponse.json(settings)
}

export async function POST(request: Request) {
  const auth = await requireWebMaster()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rawBody = await request.json().catch(() => null)
  const parsed = storeSettingsSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const result = await updateStoreSettings({ ...parsed.data, adminId: auth.adminId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const settings = await getStoreSettings()
  return NextResponse.json(settings)
}
