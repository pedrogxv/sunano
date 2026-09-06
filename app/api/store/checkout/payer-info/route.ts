import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"

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
 *
 * Responde só sobre o PERFIL. O que é do CARRINHO — se precisa de frete, se
 * o preço mudou, se algo esgotou — vive em `/api/store/cart/validate`: eram
 * duas responsabilidades nesta rota, e o checkout a chamava duas vezes na
 * abertura por causa disso.
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
      "full_name, cpf, phone, postal_code, street, number, complement, neighborhood, city, state, shipping_recipient, shipping_phone, shipping_postal_code, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state"
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
    // COBRANÇA: é o endereço que vai para o customer da Asaas no cartão.
    // Não é sobrescrito por uma entrega — comprar para presentear não muda
    // o endereço do titular.
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
    // ENTREGA: última usada, só para pré-preencher o card. O que vale para
    // despachar é sempre o snapshot no pedido.
    shipping: {
      recipient: profile?.shipping_recipient ?? null,
      phone: profile?.shipping_phone ?? null,
      postalCode: profile?.shipping_postal_code ?? null,
      street: profile?.shipping_street ?? null,
      number: profile?.shipping_number ?? null,
      complement: profile?.shipping_complement ?? null,
      neighborhood: profile?.shipping_neighborhood ?? null,
      city: profile?.shipping_city ?? null,
      state: profile?.shipping_state ?? null,
    },
  })
}
