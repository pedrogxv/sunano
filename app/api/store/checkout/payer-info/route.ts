import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { isShippingAddressRequired } from "@/lib/server/validation/shipping-address"

/**
 * Diz ao checkout, ANTES de tentar gerar o PIX/cartão, se falta nome/CPF (ou,
 * no caso de cartão, também telefone/endereço) no perfil do usuário logado —
 * para mostrar os campos direto na tela em vez de só descobrir isso depois
 * de um 400 da rota de checkout. Endereço só é exigido pela Asaas Checkout
 * (cartão); PIX segue funcionando sem ele.
 *
 * Devolve também os valores já salvos: o checkout exibe um card com os dados
 * que vão para a cobrança e deixa o usuário revisar/editar antes de pagar
 * (CPF errado no perfil derrubava o pagamento sem explicação visível).
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select(
      "full_name, cpf, phone, postal_code, street, number, complement, neighborhood, city, state"
    )
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
    // O endereço salvo no perfil é o ÚLTIMO usado (cobrança ou entrega) e
    // serve só para pré-preencher o formulário — o que vale para despachar é
    // o snapshot gravado no pedido. Por isso os mesmos campos alimentam os
    // dois cards do checkout.
    shippingAddressRequired: isShippingAddressRequired(),
    fullName: profile?.full_name ?? null,
    cpf: profile?.cpf ?? null,
    email: user.email ?? null,
    phone: profile?.phone ?? null,
    postalCode: profile?.postal_code ?? null,
    street: profile?.street ?? null,
    number: profile?.number ?? null,
    complement: profile?.complement ?? null,
    neighborhood: profile?.neighborhood ?? null,
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    hasCompletePayerInfo: Boolean(profile?.full_name && profile?.cpf),
    hasCompleteAddressInfo,
  })
}
