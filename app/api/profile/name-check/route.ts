import { NextResponse } from "next/server"

import { slugifyDisplayName, validateDisplayName } from "@/lib/profile-name"
import { isDisplayNameAvailable } from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

/**
 * GET /api/profile/name-check?name=João%20Silva
 *
 * Diz se o nome está livre enquanto a pessoa digita, para o conflito não
 * aparecer só na hora de salvar. A garantia continua sendo o índice único do
 * banco — isto aqui é conveniência de UI.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const name = new URL(request.url).searchParams.get("name")?.trim() ?? ""
    const slug = slugifyDisplayName(name)

    const invalid = validateDisplayName(name)
    if (invalid) {
      return NextResponse.json({ ok: true, slug, available: false, error: invalid })
    }

    const available = await isDisplayNameAvailable(name, authData.user.id)
    return NextResponse.json({
      ok: true,
      slug,
      available,
      error: available ? null : "Esse nome já está em uso. Escolha outro.",
    })
  } catch {
    return NextResponse.json({ error: "Erro ao verificar o nome." }, { status: 500 })
  }
}
