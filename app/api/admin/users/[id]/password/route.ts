import { NextResponse } from "next/server"
import * as z from "zod"

import { isWebMaster } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

const passwordSchema = z.object({
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: targetId } = await params

    if (!targetId) {
      return NextResponse.json({ error: "ID do usuário não informado." }, { status: 400 })
    }

    const body = await request.json()
    const parsed = passwordSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    const { data: currentProfile } = await supabase
      .from("admin_profiles")
      .select("id, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    if (!currentProfile || !isWebMaster(currentProfile)) {
      return NextResponse.json({ error: "Apenas o WEB Master pode alterar senhas de outros usuários." }, { status: 403 })
    }

    const { data: targetProfile } = await supabase
      .from("admin_profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle()

    if (!targetProfile) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
    }

    // Cannot change another WEB Master's password
    if (targetProfile.role === "webmaster" && targetId !== authData.user.id) {
      return NextResponse.json({ error: "A senha de outro WEB Master não pode ser alterada." }, { status: 403 })
    }

    const adminClient = createSupabaseAdminClient()
    const { error } = await adminClient.auth.admin.updateUserById(targetId, {
      password: parsed.data.password,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao alterar senha." }, { status: 500 })
  }
}
