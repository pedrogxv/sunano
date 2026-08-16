import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"

/**
 * Diz ao checkout, ANTES de tentar gerar o PIX, se falta nome/CPF no perfil
 * do usuário logado — para mostrar os campos direto na tela em vez de só
 * descobrir isso depois de um 400 da rota de checkout.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("full_name, cpf")
    .eq("id", user.id)
    .single()

  return NextResponse.json({
    fullName: profile?.full_name ?? null,
    hasCompletePayerInfo: Boolean(profile?.full_name && profile?.cpf),
  })
}
