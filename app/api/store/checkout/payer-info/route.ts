import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"

/**
 * Diz ao checkout, ANTES de tentar gerar o PIX/cartão, se falta nome/CPF (ou,
 * no caso de cartão, também telefone/endereço) no perfil do usuário logado —
 * para mostrar os campos direto na tela em vez de só descobrir isso depois
 * de um 400 da rota de checkout. Endereço só é exigido pela Asaas Checkout
 * (cartão); PIX segue funcionando sem ele.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("full_name, cpf, phone, postal_code, street, number, neighborhood, city, state")
    .eq("id", user.id)
    .single()

  const hasCompleteAddressInfo = Boolean(
    profile?.phone &&
      profile?.postal_code &&
      profile?.street &&
      profile?.number &&
      profile?.neighborhood &&
      profile?.city &&
      profile?.state
  )

  return NextResponse.json({
    fullName: profile?.full_name ?? null,
    hasCompletePayerInfo: Boolean(profile?.full_name && profile?.cpf),
    hasCompleteAddressInfo,
  })
}
