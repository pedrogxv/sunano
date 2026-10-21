import { NextRequest, NextResponse } from "next/server"
import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { storeCardFormOnSite, storeCardGateway } from "@/lib/server/payments/gateway"
import { PAYMENT_GATEWAY_LABEL } from "@/lib/payment-gateways"
import { getPurchaseProfile } from "@/lib/server/repositories/purchase-profile-repository"

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

  // Sessão "logado como" é somente leitura E de escopo mínimo (LGPD Art. 6º,
  // III): dar CPF e endereço do usuário para quem está fazendo suporte não tem
  // finalidade legítima.
  if (isImpersonating(request)) {
    return NextResponse.json(
      { error: "impersonation_read_only", message: "Sessão de acesso é somente leitura." },
      { status: 403 }
    )
  }

  // Mesmo leitor de Minha conta (`/api/profile/purchase-data`): as duas telas
  // editam os mesmos campos e não podem montar cada uma o seu select.
  const profile = await getPurchaseProfile(user.id)
  if (!profile) {
    return NextResponse.json({ error: "Não foi possível carregar seus dados." }, { status: 500 })
  }
  const { payer } = profile

  const hasCompleteAddressInfo = Boolean(
    payer.phone &&
      payer.postalCode &&
      payer.street &&
      payer.number &&
      payer.neighborhood &&
      payer.city &&
      payer.state
  )

  return NextResponse.json({
    // COBRANÇA: é o endereço que vai para o customer da Asaas no cartão.
    // Não é sobrescrito por uma entrega — comprar para presentear não muda
    // o endereço do titular.
    payer,
    email: user.email ?? null,
    hasCompletePayerInfo: Boolean(payer.fullName && payer.cpf),
    hasCompleteAddressInfo,
    // Quem cobra o CARTÃO: só ele aparece no texto do checkout (o PIX é
    // igual em qualquer gateway). `cardFormOnSite` = o cartão é digitado no
    // nosso site, e não numa página hospedada pelo gateway.
    paymentGatewayLabel: PAYMENT_GATEWAY_LABEL[storeCardGateway()],
    cardFormOnSite: storeCardFormOnSite(),
    // Mercado Pago: o formulário do cartão abre no próprio checkout, e o pedido
    // só nasce quando a pessoa paga (ver o ramo dele em `/api/store/checkout`).
    cardGateway: storeCardGateway(),
    // ENTREGA: última usada, só para pré-preencher o card. O que vale para
    // despachar é sempre o snapshot no pedido.
    shipping: profile.shipping,
  })
}
