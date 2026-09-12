import { headers } from "next/headers"
import { NextResponse } from "next/server"
import * as z from "zod"

import { canChangePasswords, isWebMaster } from "@/lib/admin-permissions"
import { isLocalhostHost, validatePassword } from "@/lib/password-policy"
import { verifyCurrentPassword } from "@/lib/server/auth/verify-current-password"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Informe sua senha atual."),
  password: z.string().min(1, "Informe uma senha."),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = passwordSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const headersList = await headers()
    const relaxed = isLocalhostHost(headersList.get("host"))
    const policyError = validatePassword(parsed.data.password, relaxed)
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user?.email) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("admin_profiles")
      .select("id, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    if (!profile || !canChangePasswords(profile) || !isWebMaster(profile)) {
      return NextResponse.json({ error: "Apenas o WEB Master pode alterar senhas." }, { status: 403 })
    }

    // Senha atual obrigatória, igual à troca de senha de Conta: sem ela, uma
    // sessão roubada do WEB MASTER trocava a senha da conta mais privilegiada
    // do site e o dono perdia o acesso de vez.
    const check = await verifyCurrentPassword(
      authData.user.id,
      authData.user.email,
      parsed.data.currentPassword
    )
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status })
    }

    const { error } = await supabase.auth.updateUser({
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