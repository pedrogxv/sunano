import { headers } from "next/headers"
import { NextResponse } from "next/server"
import * as z from "zod"

import { isLocalhostHost, validatePassword } from "@/lib/password-policy"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

const passwordSchema = z.object({
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

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao alterar senha." }, { status: 500 })
  }
}
