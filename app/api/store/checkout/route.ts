import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import {
  findOrCreateCustomer,
  createPixPayment,
  getPixQrCode,
  createCheckout,
  type AsaasCheckoutItem,
} from "@/lib/server/integrations/asaas"
import {
  cancelStripePayment,
  createStripeCardPayment,
  createStripePixPayment,
} from "@/lib/server/integrations/stripe"
import {
  isActiveGatewaySandbox,
  storeCardGateway,
  storeCardMaxInstallments,
  storeCardPaymentsEnabled,
  storePixGateway,
} from "@/lib/server/payments/gateway"
import { MercadoPagoError } from "@/lib/server/integrations/mercadopago"
import { payMercadoPagoCardOrder } from "@/lib/server/repositories/mercadopago-orders-repository"
import { mercadoPagoCardSchema } from "@/lib/server/validation/mercadopago-card"
import { mercadoPagoDeclineMessage } from "@/lib/card-decline-messages"
import { createInfinitePayCheckoutLink, infinitePayWebhookUrl } from "@/lib/server/integrations/infinitepay"
import {
  getPendingOrdersSnapshot,
  replacePendingOrders,
} from "@/lib/server/repositories/pending-order-conflicts-repository"
import { PENDING_ORDER_CONFLICT_CODE } from "@/lib/store-pending-orders"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import {
  payerInfoSchema,
  payerAddressSchema,
} from "@/lib/server/validation/guest-checkout"
import {
  orderNeedsShippingAddress,
  parseOptionalShippingAddress,
  shippingAddressColumns,
} from "@/lib/server/validation/shipping-address"
import { checkRateLimit, getClientIpIdentifier } from "@/lib/server/rate-limit"
import { dbErrorResponse } from "@/lib/db-errors"
import {
  getVariantsForCheckout,
  getSelectionRulesForCheckout,
  getVariantOptionsForCheckout,
  getRecentProductPurchaseQuantity,
  getSkusForProducts,
  getLaunchAndPreorderInfo,
  DAILY_PURCHASE_LIMIT_NO_STOCK,
} from "@/lib/server/repositories/store-repository"
import {
  PIX_EXPIRATION_MINUTES,
  PREORDER_PIX_EXPIRATION_MINUTES,
  releaseReservationGroup,
  reserveStock,
  restoreStock,
  type StockMovement,
} from "@/lib/server/repositories/orders-repository"
import { acquireLease, type Lease } from "@/lib/server/lease"
import { rejectIfBot } from "@/lib/server/bot-check"
import { payerDocumentFingerprint } from "@/lib/server/payer-fingerprint"
import {
  getCustomerLimits,
  getCustomerProductQuantities,
} from "@/lib/server/repositories/customer-purchase-limits-repository"
import { MAX_QUANTITY_PER_LINE } from "@/lib/store-cart-limits"
import { revalidateStoreProducts } from "@/lib/server/seo/revalidate-public"
import { getStoreSettings } from "@/lib/server/repositories/store-settings-repository"
import {
  readAffiliateRefCookie,
  resolveAffiliateCode,
  type AffiliateAttribution,
} from "@/lib/server/affiliate-attribution"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEventInBackground } from "@/lib/server/repositories/discord-orders-repository"
import { canUseStoreNow } from "@/lib/server/auth/store-access"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { computeCardTotalCents, computeItemCardPriceCents, isSinglePriceProduct } from "@/lib/store-pricing"
import { readServiceFormFields } from "@/lib/store-service-form"
import { resolveComplementCharge, type ComplementCharge } from "@/lib/server/repositories/order-complement-repository"
import { effectivePreorderStatus, PREORDER_STATUS_LABEL } from "@/lib/store-preorder"
import { resolveSelection, type ResolvedSelection } from "@/lib/store-sku"
import { SITE_URL } from "@/lib/site-url"
import { orderNumber } from "@/lib/order-number"
import type { Database } from "@/lib/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
// O cartão do Mercado Pago é cobrado dentro desta requisição (ver o ramo
// dele): 20 s cobriam só o banco e a emissão do PIX.
export const maxDuration = 30

type DecrementedLine = StockMovement

const MAX_ITEM_LINES = 50

/**
 * Prazo da trava "um checkout por conta" (ver `acquireLease`). Cobre o
 * `maxDuration` com folga: se a Function morrer segurando a trava, ela vence
 * sozinha e a próxima tentativa da pessoa passa.
 */
const CHECKOUT_LEASE_SECONDS = maxDuration + 15

/** Resposta quando a mesma conta já tem um checkout em andamento. */
const CHECKOUT_IN_PROGRESS_CODE = "checkout_in_progress"

/**
 * Pedidos aguardando pagamento que uma conta pode ter ao mesmo tempo.
 *
 * Cada pedido pendente segura estoque (60 min no PIX) ou vaga do lote de
 * pré-venda (24h, porque `preorder_reserved_quantity` conta `pending`). Sem
 * teto, uma conta com script mantinha a loja "esgotada" e o lote travado
 * indefinidamente, gerando uma cobrança na Asaas por tentativa. Três cobre
 * quem desistiu de um carrinho e montou outro; a partir daí a pessoa cancela
 * um em "Meus Pedidos" (ou ele expira) e segue.
 */
const MAX_PENDING_ORDERS_PER_USER = 3

// Ids são UUID: validar o formato aqui devolve 400 com mensagem, em vez de
// deixar o Postgres recusar o `in.(...)` lá na frente com um 500.
const checkoutItemSchema = z.object({
  productId: z.uuid("Item inválido no carrinho. Remova-o e adicione de novo."),
  variantId: z.uuid("Item inválido no carrinho. Remova-o e adicione de novo.").nullish(),
  variantOptionIds: z
    .array(z.uuid("Item inválido no carrinho. Remova-o e adicione de novo."))
    .max(20, "Item inválido no carrinho. Remova-o e adicione de novo.")
    .nullish(),
  quantity: z
    .number("Quantidade inválida no carrinho.")
    .int("Quantidade inválida no carrinho.")
    .min(1, "Quantidade inválida no carrinho."),
})

const checkoutBodySchema = z.object({
  items: z
    .array(checkoutItemSchema, { error: "Carrinho vazio" })
    .min(1, "Carrinho vazio")
    .max(MAX_ITEM_LINES, "Carrinho com itens demais."),
  guestName: payerInfoSchema.shape.guestName.optional(),
  guestDocument: payerInfoSchema.shape.guestDocument.optional(),
  guestPhone: payerAddressSchema.shape.guestPhone.optional(),
  guestPostalCode: payerAddressSchema.shape.guestPostalCode.optional(),
  guestStreet: payerAddressSchema.shape.guestStreet.optional(),
  guestNumber: payerAddressSchema.shape.guestNumber.optional(),
  guestComplement: payerAddressSchema.shape.guestComplement,
  guestNeighborhood: payerAddressSchema.shape.guestNeighborhood.optional(),
  guestCity: payerAddressSchema.shape.guestCity.optional(),
  guestState: payerAddressSchema.shape.guestState.optional(),
  paymentMethod: z.enum(["pix", "credit_card"]).default("pix"),
  // Endereço de ENTREGA (distinto do endereço de cobrança `guest*` acima,
  // que a Asaas exige no customer do cartão). Cada campo é `unknown` aqui
  // porque a validação real acontece em `parseOptionalShippingAddress`, que
  // precisa distinguir "não mandou nada" (legítimo enquanto é opcional) de
  // "mandou pela metade" (recusado).
  shippingRecipient: z.unknown().optional(),
  shippingCpf: z.unknown().optional(),
  shippingBirthDate: z.unknown().optional(),
  shippingResidenceType: z.unknown().optional(),
  shippingPhone: z.unknown().optional(),
  shippingPostalCode: z.unknown().optional(),
  shippingStreet: z.unknown().optional(),
  shippingNumber: z.unknown().optional(),
  shippingComplement: z.unknown().optional(),
  shippingNeighborhood: z.unknown().optional(),
  shippingCity: z.unknown().optional(),
  shippingState: z.unknown().optional(),
  /**
   * Afiliado escolhido no seletor do checkout. Ausente = cliente antigo, vale
   * o cookie do link. `null`/"" = a pessoa escolheu não apoiar ninguém, e
   * isso também desliga o cookie.
   */
  affiliateCode: z.string().max(40).nullish(),
  /**
   * Complemento de Pagamento: o pedido cujo valor pendente esta compra paga.
   * Só o id; o valor sai do pedido, no servidor (`resolveComplementCharge`).
   */
  complementOrderId: z.uuid("Pedido do complemento inválido.").optional(),
  /**
   * Cartão do Mercado Pago: o token do Card Payment Brick. O pedido só nasce
   * junto com a cobrança (ver o ramo do Mercado Pago), então ele vem aqui, e
   * não numa segunda chamada depois de o pedido existir.
   */
  card: mercadoPagoCardSchema.optional(),
  /**
   * Pedidos pendentes que esta compra substitui (resposta ao 409
   * `pending_order_conflict`). Só confirma a escolha: quem decide o que é
   * cancelado é o servidor, pelos pedidos do usuário com produto do carrinho.
   */
  replacePendingOrderIds: z.array(z.uuid()).max(MAX_PENDING_ORDERS_PER_USER * 2).optional(),
  /** Marca explícita de "não quero informar agora" — só aceita enquanto o endereço for opcional. */
})

/**
 * Segunda barreira de auto-indicação, aplicada quando o CPF do pagador já foi
 * resolvido (bem depois da atribuição, que só conhece o `user_id` da sessão).
 *
 * A checagem por `user_id` sozinha só pega o caso ingênuo — criar uma segunda
 * conta e comprar pelo próprio link passava por ela e virava um desconto de 5%
 * permanente para si mesmo. O CPF é o que a mesma pessoa não consegue trocar:
 * a Asaas exige um CPF válido do pagador, e o afiliado já cadastrou o dele
 * quando pediu afiliação com chave PIX do tipo `cpf`.
 *
 * Compara também com o CPF do perfil do afiliado, que cobre quem se cadastrou
 * com chave PIX de outro tipo (e-mail, aleatória), e com todo documento já
 * usado como chave de SAQUE: `request_affiliate_payout` sobrescreve
 * `affiliates.pix_key` a cada pedido, então a chave da afiliação se perdia e
 * bastava sacar uma vez com chave de e-mail para a comparação ficar cega.
 *
 * Continua sendo heurística, não prova: o pagador pode informar o CPF de
 * outra pessoa (a Asaas só exige que seja válido). A revisão do saque segue
 * sendo o controle que fecha a fraude de verdade.
 */
async function isSelfReferral(
  db: SupabaseClient<Database>,
  affiliateId: string,
  affiliateUserId: string,
  payerDocument: string | null
): Promise<boolean> {
  if (!payerDocument) return false
  const normalizedPayer = payerDocument.replace(/\D/g, "")
  if (!normalizedPayer) return false

  const [{ data: affiliateRow }, { data: affiliateProfile }, { data: payoutRows }] = await Promise.all([
    db
      .from("affiliates")
      .select("pix_key, pix_key_type")
      .eq("user_id", affiliateUserId)
      .maybeSingle(),
    db.from("user_profiles").select("cpf").eq("id", affiliateUserId).maybeSingle(),
    db
      .from("affiliate_payout_requests")
      .select("pix_key, pix_key_type")
      .eq("affiliate_id", affiliateId)
      .in("pix_key_type", ["cpf", "cnpj"]),
  ])

  const candidates = [
    affiliateRow?.pix_key_type === "cpf" || affiliateRow?.pix_key_type === "cnpj"
      ? affiliateRow.pix_key
      : null,
    affiliateProfile?.cpf,
    ...(payoutRows ?? []).map((row) => row.pix_key),
  ]

  return candidates.some(
    (candidate) => candidate && candidate.replace(/\D/g, "") === normalizedPayer
  )
}

/**
 * Reverte as reservas de estoque já aplicadas neste request. Não há
 * transação via PostgREST entre a reserva e o insert do pedido, então o
 * rollback é manual — mas cada metade dele é atômica:
 *
 * - Com `reservationGroup` (o pedido ainda não existe): diário e estoque
 *   voltam juntos numa transação (`releaseReservationGroup`), inclusive as
 *   reservas de pré-venda. Antes o diário era apagado e o estoque devolvido
 *   linha a linha depois: morrer no meio perdia as unidades.
 * - Sem (o pedido existiu e foi apagado, ex. cartão recusado): o diário já
 *   foi baixado em `confirmReservations`, e cada linha volta por `restoreStock`.
 */
async function revertDecrements(
  db: SupabaseClient<Database>,
  lines: DecrementedLine[],
  reservationGroup?: string
) {
  if (reservationGroup) {
    await releaseReservationGroup(db, reservationGroup, lines)
    return
  }

  await Promise.all(
    lines.map(async (line) => {
      try {
        await restoreStock(db, line)
      } catch (err) {
        console.error(
          "[checkout] falha ao reverter reserva de estoque:",
          line,
          err
        )
      }
    })
  )
}

/**
 * Baixa as reservas deste request do diário: o pedido já existe, então é ele
 * que passa a segurar o estoque, e o cron não deve mais devolver nada.
 *
 * Falha aqui é grave o suficiente para logar, mas não para derrubar a compra
 * — o pedido está criado e pagável. O efeito de uma linha esquecida no diário
 * é o cron devolver ao estoque uma unidade que um pedido real está segurando,
 * então isso precisa ser visível no log.
 */
async function confirmReservations(
  db: SupabaseClient<Database>,
  reservationGroup: string
) {
  const { error } = await db
    .from("store_stock_reservations")
    .delete()
    .eq("reservation_group", reservationGroup)
  if (error) {
    console.error(
      "[checkout] falha ao baixar reserva do diário (pedido já criado):",
      reservationGroup,
      error
    )
  }
}

/**
 * Converte os itens do pedido (preços PIX) nos itens exibidos na página de
 * checkout hospedada da Asaas, já no preço de cartão.
 *
 * Detalhar item a item, em vez de mandar uma linha só "Pedido — N itens",
 * é o que faz o cliente reconhecer a compra na página de pagamento e na
 * fatura do cartão — reduz abandono e contestação, e deixa o painel da Asaas
 * conciliável com o pedido.
 *
 * O ajuste de centavos existe porque o acréscimo do cartão é calculado sobre
 * o TOTAL (`computeCardTotalCents`), não item a item:
 * converter cada unidade isoladamente e somar dá diferença de alguns centavos
 * por arredondamento. Como a Asaas cobra a soma dos itens, a sobra vai toda
 * para o item mais caro (onde some percentualmente melhor) — assim a soma
 * fecha exatamente com `cardTotalCents`, que é o valor gravado no pedido e
 * mostrado na tela.
 */
function buildAsaasCheckoutItems(
  orderItems: {
    name: string
    price_cents: number
    quantity: number
    variant_label: string | null
    variant_options: { group: string; label: string }[]
    single_price: boolean
  }[],
  cardTotalCents: number,
  cardSurchargePercent: number
): AsaasCheckoutItem[] {
  const items = orderItems.map((item) => {
    // Separadores dentro do que a Asaas aceita (ver sanitizeAsaasText): "·"
    // e ":" seriam removidos lá e a linha viraria um amontoado de palavras.
    const details = [
      item.variant_label,
      ...item.variant_options.map((o) => `${o.group} - ${o.label}`),
    ].filter(Boolean)
    return {
      // A Asaas limita o nome do item; corta sem truncar no meio do acento.
      name: item.name.slice(0, 100),
      quantity: item.quantity,
      // Serviço tem preço único: vai para a Asaas sem o acréscimo do cartão.
      unitPriceCents: computeItemCardPriceCents(item.price_cents, cardSurchargePercent, item.single_price),
      description: details.length > 0 ? details.join(", ").slice(0, 255) : null,
    }
  })

  const sum = items.reduce((acc, i) => acc + i.quantity * i.unitPriceCents, 0)
  const diffCents = cardTotalCents - sum
  if (diffCents !== 0 && items.length > 0) {
    // Prefere uma linha de quantidade 1, onde o ajuste cabe direto no
    // unitário; senão, o item mais caro, em que a sobra some percentualmente
    // melhor.
    const target =
      items.find((i) => i.quantity === 1) ??
      items.reduce((a, b) => (b.unitPriceCents > a.unitPriceCents ? b : a))
    if (diffCents % target.quantity === 0) {
      target.unitPriceCents += diffCents / target.quantity
    } else {
      // Não divide certo no item escolhido: quebra a linha em uma unidade
      // separada que carrega o ajuste, mantendo a soma exata.
      target.quantity -= 1
      items.push({
        name: target.name,
        quantity: 1,
        unitPriceCents: target.unitPriceCents + diffCents,
        description: target.description,
      })
    }
  }

  return items
}

/**
 * "2x Mouse X (Preto), Mousepad Y e mais 1" — resumo dos itens para a descrição da
 * cobrança. Cortado em ~200 caracteres: a Asaas aceita 500 e o painel do
 * Stripe trunca a coluna bem antes disso.
 */
function summarizeChargeItems(
  items: { name: string; quantity: number; variant_label: string | null }[]
): string {
  const MAX = 200
  const parts = items.map((item) => {
    const qty = item.quantity > 1 ? `${item.quantity}x ` : ""
    const variant = item.variant_label ? ` (${item.variant_label})` : ""
    return `${qty}${item.name}${variant}`
  })
  let out = ""
  for (let i = 0; i < parts.length; i++) {
    const next = out ? `${out}, ${parts[i]}` : parts[i]
    const rest = parts.length - i - 1
    const suffix = rest > 0 ? ` e mais ${rest}` : ""
    if (out && (next + suffix).length > MAX) return `${out} e mais ${parts.length - i}`
    out = next
  }
  return out.length > MAX ? `${out.slice(0, MAX - 3)}...` : out
}

export async function POST(request: NextRequest) {
  // Declarado fora do try para o catch externo conseguir reverter reservas
  // de estoque já aplicadas mesmo se uma exceção (ex. chamada ao gateway)
  // interromper o fluxo antes do insert do pedido.
  const decrementedLines: DecrementedLine[] = []
  // Identifica as reservas deste request no diário `store_stock_reservations`.
  // O diário é a rede de segurança para o caso em que a Function morre entre
  // o decremento e o insert do pedido: aí não há pedido para nenhum cron
  // achar, e sem ele o estoque ficaria descontado para sempre.
  const reservationGroup = randomUUID()
  const db = createSupabaseAdminClient()
  // Depois de `confirmReservation` o PEDIDO segura o estoque: um erro dali em
  // diante (aviso, Discord) não pode devolver as unidades — o pedido segue
  // pendente e é a expiração dele que as devolve. Antes, o catch externo
  // devolvia de qualquer jeito e deixava estoque a mais na prateleira.
  let reservationConfirmed = false
  const confirmReservation = async () => {
    await confirmReservations(db, reservationGroup)
    reservationConfirmed = true
  }
  // Trava "um checkout por conta" (ver o portão logo depois da autenticação).
  let checkoutLease: Lease | null = null
  // Trava por CPF, só em compra de produto com limite por cliente.
  let payerLease: Lease | null = null

  // Segunda checagem da mesma flag que o proxy já aplica (proxy.ts) — fechado
  // por padrão, caso o matcher/lógica do proxy mude e essa rota deixe de
  // passar por lá. Ignora a manutenção, igual no proxy, só quem
  // tem a liberação individual do "pacote Loja" (user_profiles.store_access).
  if (isStoreMaintenanceEnabled() && !(await canUseStoreNow())) {
    return NextResponse.json(
      {
        error: "A Loja está temporariamente indisponível para novos pedidos.",
      },
      { status: 503 }
    )
  }

  try {
    // Primeiro portão, ANTES de autenticar: só contém flood anônimo contra a
    // rota. O teto é folgado de propósito, porque CG-NAT/redes corporativas
    // fazem compradores sem relação nenhuma dividirem o mesmo IP. O
    // identificador é só o IP: com IP+UA, trocar o User-Agent a cada
    // requisição renovava a cota. Quem limita de verdade é o portão por
    // conta, logo abaixo.
    const ipRateLimit = await checkRateLimit({
      action: "store_checkout_create_ip",
      identifier: getClientIpIdentifier(request),
      maxAttempts: 40,
      windowSeconds: 600,
      onError: "closed",
    })
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de compra. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      )
    }

    // Vercel BotID (Basic, gratuito): script que dispara compras sem rodar o
    // desafio no navegador. Antes da sessão e de qualquer escrita.
    const botBlocked = await rejectIfBot("checkout")
    if (botBlocked) return botBlocked

    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json(
        { error: "Você precisa estar logado para finalizar a compra." },
        { status: 401 }
      )
    }
    // Portão real: a cota é da CONTA, só do id. A versão anterior compunha
    // `user.id` com o hash de IP+UA, e isso deixava a mesma conta renovar o
    // limite trocando de rede ou de User-Agent, justamente na rota mais cara
    // do fluxo (cada tentativa gera cobrança e QR code na Asaas).
    const userRateLimit = await checkRateLimit({
      action: "store_checkout_create",
      identifier: user.id,
      maxAttempts: 10,
      windowSeconds: 600,
      onError: "closed",
    })
    if (!userRateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas de compra. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      )
    }

    // Segunda trava do modo somente-leitura da impersonation (a primeira é o
    // proxy). Comprar em nome de outra pessoa é o exato oposto do escopo de
    // uma sessão de suporte.
    if (isImpersonating(request)) {
      return NextResponse.json(
        {
          error: "impersonation_read_only",
          message: "Sessão de acesso é somente leitura; não é possível finalizar uma compra.",
        },
        { status: 403 }
      )
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = checkoutBodySchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? "Carrinho inválido." },
        { status: 400 }
      )
    }
    const { items, paymentMethod, complementOrderId } = parsedBody.data

    // Um checkout por conta por vez. Tudo daqui até o insert do pedido é
    // "ler, decidir, gravar" em várias idas ao banco: o teto de pedidos
    // pendentes, a trava de um pedido por produto e o limite diário leem o
    // estado ANTES de o pedido existir. Sem a trava, duas abas (ou um script,
    // ou o duplo clique) passavam todas pelas conferências e cada uma
    // segurava estoque e gerava uma cobrança. Com ela, a segunda requisição
    // espera a primeira terminar — e aí enxerga o pedido que ela criou.
    checkoutLease = await acquireLease(`store_checkout:${user.id}`, CHECKOUT_LEASE_SECONDS)
    if (!checkoutLease.acquired && checkoutLease.reason === "error") {
      return NextResponse.json(
        { error: "Não foi possível iniciar a compra agora. Tente novamente em instantes." },
        { status: 503 }
      )
    }
    if (!checkoutLease.acquired) {
      return NextResponse.json(
        {
          error: "Já estamos processando um pedido seu. Aguarde alguns segundos e confira em Meus Pedidos antes de tentar de novo.",
          code: CHECKOUT_IN_PROGRESS_CODE,
        },
        { status: 409 }
      )
    }

    // Pedidos em aberto do usuário (ver `pending-order-conflicts-repository`).
    // Um produto do carrinho já num pedido pendente = 409 até a pessoa
    // escolher pagar o aberto ou substituí-lo (`replacePendingOrderIds`). O
    // complemento não passa pelo carrinho: só conta para o teto.
    const pendingSnapshot = await getPendingOrdersSnapshot({
      userId: user.id,
      productIds: complementOrderId ? [] : items.map((item) => item.productId),
      isSandbox: isActiveGatewaySandbox(),
    })
    if (!pendingSnapshot.ok) {
      const { body, status } = dbErrorResponse(
        pendingSnapshot.error,
        "Não foi possível conferir seus pedidos em aberto. Tente novamente."
      )
      return NextResponse.json(body, { status })
    }
    const { pendingIds, conflictIds } = pendingSnapshot.snapshot
    const replaceRequested = new Set(parsedBody.data.replacePendingOrderIds ?? [])
    if (conflictIds.some((id) => !replaceRequested.has(id))) {
      return NextResponse.json(
        {
          error: "Você já tem um pedido aguardando pagamento com este produto. Pague esse pedido ou substitua-o por este.",
          code: PENDING_ORDER_CONFLICT_CODE,
          pendingOrderIds: conflictIds,
        },
        { status: 409 }
      )
    }
    // Só os que o servidor achou: o corpo nunca escolhe o que cancelar.
    const ordersToReplace = conflictIds

    // Teto de pedidos pendentes (ver MAX_PENDING_ORDERS_PER_USER), já sem os
    // que esta compra vai substituir.
    const remainingPending = pendingIds.length - ordersToReplace.length
    if (remainingPending >= MAX_PENDING_ORDERS_PER_USER) {
      return NextResponse.json(
        {
          error: `Você já tem ${remainingPending} pedidos aguardando pagamento. Pague ou cancele um deles em Meus Pedidos antes de criar outro.`,
        },
        { status: 409 }
      )
    }

    // Escolha do seletor ganha do cookie. Um código escolhido que não serve
    // mais (afiliado suspenso entre abrir a tela e pagar) é recusado em vez
    // de ignorado: a pessoa quis apoiar alguém e acharia que apoiou.
    const chosenAffiliateCode = parsedBody.data.affiliateCode
    let affiliateAttribution: AffiliateAttribution | null = null
    if (chosenAffiliateCode === undefined) {
      const cookieCode = readAffiliateRefCookie(request)
      affiliateAttribution = cookieCode ? await resolveAffiliateCode(cookieCode, user.id) : null
    } else if (chosenAffiliateCode) {
      affiliateAttribution = await resolveAffiliateCode(chosenAffiliateCode, user.id)
      if (!affiliateAttribution) {
        return NextResponse.json(
          { error: "O afiliado escolhido não está mais disponível. Escolha outro ou nenhum." },
          { status: 400 }
        )
      }
    }

    // Cartão desligado (`STORE_PAYMENT_METHODS`, Stripe implícito ou config
    // do gateway inválida — ver `storeCardPaymentsEnabled`). A tela já não
    // oferece o botão; isto barra o corpo montado à mão.
    if (paymentMethod === "credit_card" && !storeCardPaymentsEnabled()) {
      return NextResponse.json(
        { error: "Pagamento com cartão indisponível no momento. Use PIX." },
        { status: 400 }
      )
    }

    // Limite adicional (mais rígido) só pra tentativas de cartão, em cima do
    // limite geral acima — cartão é o alvo natural de spam/enumeração de
    // checkout mesmo sem receber dados de cartão de verdade (o link gerado
    // custa uma chamada na Asaas a cada tentativa). Ação separada do limite
    // geral pra não derrubar quem só está comprando PIX no mesmo IP.
    const chargesCardNow = paymentMethod === "credit_card" && storeCardGateway() === "mercadopago"
    if (paymentMethod === "credit_card" && !chargesCardNow) {
      const cardRateLimit = await checkRateLimit({
        action: "store_checkout_card_attempt",
        identifier: user.id,
        maxAttempts: 3,
        windowSeconds: 600,
        onError: "closed",
      })
      if (!cardRateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "Muitas tentativas de compra no cartão. Aguarde alguns minutos e tente novamente.",
          },
          { status: 429 }
        )
      }
    }

    // Mercado Pago: cada chamada aqui é uma tentativa de cartão de verdade, então
    // valem os MESMOS tetos da rota de nova tentativa
    // (`/api/store/orders/[id]/card-payment`), com as mesmas chaves — o robô
    // testando cartão roubado não escapa alternando entre as duas rotas. O
    // teto de 3 em 10 min acima é do link hospedado da Asaas e barraria quem
    // só errou o CVV.
    if (chargesCardNow) {
      if (!parsedBody.data.card) {
        return NextResponse.json(
          { error: "Digite os dados do cartão para pagar. Recarregue a página se o formulário não aparecer." },
          { status: 400 }
        )
      }
      const cardLimits = [
        { action: "store_card_confirm_ip", identifier: getClientIpIdentifier(request), maxAttempts: 20 },
        { action: "store_card_confirm_user", identifier: user.id, maxAttempts: 10 },
      ]
      for (const limit of cardLimits) {
        const result = await checkRateLimit({ ...limit, windowSeconds: 60 * 60, onError: "closed" })
        if (!result.allowed) {
          return NextResponse.json(
            { error: "Muitas tentativas com cartão. Aguarde um pouco ou pague com PIX." },
            { status: 429 }
          )
        }
      }
      const settings = await getStoreSettings()
      if (parsedBody.data.card.installments > Math.max(1, storeCardMaxInstallments(settings.cardMaxInstallments))) {
        return NextResponse.json({ error: "Número de parcelas indisponível. Escolha outro." }, { status: 400 })
      }
    }

    // Substitui o pedido aberto AGORA, depois das validações baratas (uma
    // recusa acima não pode deixar a pessoa sem o pedido antigo e sem o
    // novo) e ANTES da reserva: com 1 unidade em estoque, é o pedido antigo
    // que a segura.
    if (ordersToReplace.length > 0) {
      const replaced = await replacePendingOrders(ordersToReplace)
      if (!replaced.ok) {
        return NextResponse.json(
          {
            error: `O pedido #${orderNumber(replaced.paidOrderId)} acabou de ser pago. Confira em Meus Pedidos antes de comprar de novo.`,
          },
          { status: 409 }
        )
      }
    }

    // Agrupa por (produto, variante, opções de variante) antes de checar
    // estoque — sem isso, repetir o mesmo par em várias entradas do carrinho
    // passava pela checagem de estoque por linha mesmo pedindo, no total,
    // mais unidades do que existem. Combinações diferentes do mesmo produto
    // NÃO são mescladas — cada uma tem seu próprio estoque/preço.
    const lineKey = (
      productId: string,
      variantId: string | null,
      optionIds: string[]
    ) => `${productId}:${variantId ?? ""}:${[...optionIds].sort().join(",")}`
    const quantityByLine = new Map<
      string,
      {
        productId: string
        variantId: string | null
        optionIds: string[]
        quantity: number
      }
    >()
    for (const item of items) {
      const variantId = item.variantId ?? null
      const optionIds = [...new Set(item.variantOptionIds ?? [])]
      const key = lineKey(item.productId, variantId, optionIds)
      const existing = quantityByLine.get(key)
      quantityByLine.set(key, {
        productId: item.productId,
        variantId,
        optionIds,
        quantity: (existing?.quantity ?? 0) + item.quantity,
      })
    }

    if (
      [...quantityByLine.values()].some(
        (line) => line.quantity > MAX_QUANTITY_PER_LINE
      )
    ) {
      return NextResponse.json(
        { error: "Quantidade por produto excede o limite permitido." },
        { status: 400 }
      )
    }

    // Preço e estoque SEMPRE vêm do banco — o corpo da requisição só informa
    // productId/variantId/quantity. O cliente nunca envia (nem influencia)
    // price_cents: isso fecha a brecha de manipular o valor cobrado pelo carrinho.
    const mergedItems = [...quantityByLine.values()]
    const productIds = [...new Set(mergedItems.map((line) => line.productId))]
    const variantIds = [
      ...new Set(
        mergedItems
          .map((line) => line.variantId)
          .filter((id): id is string => id != null)
      ),
    ]
    const optionIds = [
      ...new Set(mergedItems.flatMap((line) => line.optionIds)),
    ]

    const [
      { data: products, error: dbError },
      variants,
      variantOptions,
      skus,
      selectionRules,
    ] = await Promise.all([
      db
        .from("store_products")
        .select(
          "id, slug, name, price_cents, promo_price_cents, stock, images, type, condition, is_active, is_sold_out, requires_shipping, sale_type, category, service_form_fields, is_payment_complement, sale_window_ends_at"
        )
        .in("id", productIds),
      getVariantsForCheckout(variantIds),
      getVariantOptionsForCheckout(optionIds),
      getSkusForProducts(productIds),
      getSelectionRulesForCheckout(productIds),
    ])

    if (dbError) {
      const { body, status } = dbErrorResponse(
        dbError,
        "Não foi possível carregar os produtos do carrinho."
      )
      return NextResponse.json(body, { status })
    }

    if (!products || products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Um ou mais produtos não encontrados" },
        { status: 404 }
      )
    }

    if (!selectionRules) {
      return NextResponse.json(
        { error: "Não foi possível carregar os produtos do carrinho." },
        { status: 503 }
      )
    }

    // Prazo de pré-venda/lançamento vencido que o cron (a cada 5 min) ainda
    // não fechou: o preço da oferta segue gravado até lá, e esta rota cobraria
    // a oferta depois de a contagem da página zerar (ou para sempre, com o
    // cron parado). Fecha agora, pela mesma RPC idempotente do cron, e manda
    // o carrinho buscar o preço novo em vez de cobrar o antigo.
    const now = Date.now()
    const expiredWindows = products.filter(
      (product) => product.sale_window_ends_at && Date.parse(product.sale_window_ends_at) <= now
    )
    if (expiredWindows.length > 0) {
      const { error: closeError } = await db.rpc("close_store_sale_windows")
      if (closeError) console.error("[checkout] close_store_sale_windows:", closeError)
      revalidateStoreProducts(expiredWindows.map((product) => product.slug))
      return NextResponse.json(
        {
          error: `O prazo da oferta de "${expiredWindows[0].name}" terminou e o preço foi atualizado. Recarregue a página para conferir o valor novo.`,
        },
        { status: 409 }
      )
    }

    // Complemento de Pagamento: sozinho, uma unidade, com o pedido que ele
    // paga. O preço do anúncio não vale nada; quem diz o valor é o pedido.
    // Sem esta trava, o anúncio entraria pelo carrinho pelo preço cadastrado.
    let complementCharge: Extract<ComplementCharge, { ok: true }> | null = null
    const hasComplementProduct = products.some((product) => product.is_payment_complement)
    if (hasComplementProduct || complementOrderId) {
      if (
        !hasComplementProduct ||
        !complementOrderId ||
        mergedItems.length !== 1 ||
        mergedItems[0].quantity !== 1 ||
        mergedItems[0].variantId ||
        mergedItems[0].optionIds.length > 0
      ) {
        return NextResponse.json(
          {
            error:
              "O Complemento de Pagamento é pago sozinho, pelo número do pedido, na página do anúncio. Remova-o do carrinho.",
          },
          { status: 400 }
        )
      }
      const charge = await resolveComplementCharge(user.id, complementOrderId, isActiveGatewaySandbox())
      if (!charge.ok) {
        return NextResponse.json({ error: charge.error }, { status: charge.status })
      }
      complementCharge = charge
    }

    if (variants.length !== variantIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais variantes não encontradas" },
        { status: 404 }
      )
    }

    if (variantOptions.length !== optionIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais variantes não encontradas" },
        { status: 404 }
      )
    }

    // Lote de cada pré-venda: a mensagem de recusa diz o status com o mesmo
    // nome da tela, e o item do pedido guarda de qual lote é a reserva.
    const preorderInfo = await getLaunchAndPreorderInfo(
      products.map((product) => ({ id: product.id, sale_type: product.sale_type }))
    )

    // Validação síncrona (sem query) de cada linha antes de tocar o banco —
    // nenhum decremento acontece ainda aqui, então não precisa reverter nada
    // em caso de erro.
    type ValidatedLine = {
      product: (typeof products)[number]
      variant: (typeof variants)[number] | null
      options: (typeof variantOptions)[number][]
      /** Preço, estoque e SKU da combinação — a MESMA resolução da página do produto. */
      selection: ResolvedSelection
      quantity: number
    }
    const validatedLines: ValidatedLine[] = []
    for (const cartItem of mergedItems) {
      const product = products.find((p) => p.id === cartItem.productId)
      if (!product) {
        return NextResponse.json(
          { error: `Produto não encontrado: ${cartItem.productId}` },
          { status: 404 }
        )
      }
      if (!product.is_active) {
        return NextResponse.json(
          { error: `Produto indisponível: ${product.name}` },
          { status: 400 }
        )
      }
      if (product.is_sold_out) {
        return NextResponse.json(
          { error: `Produto esgotado: ${product.name}` },
          { status: 400 }
        )
      }
      // A recusa de verdade é de `reserve_preorder` (lote fechado ou cheio);
      // aqui só evita gastar a reserva das outras linhas para descobrir isso.
      const preorder = preorderInfo.get(product.id)?.preorder
      if (preorder) {
        const status = effectivePreorderStatus(preorder, product.is_sold_out)
        if (status !== "open") {
          return NextResponse.json(
            { error: `A pré-venda de "${product.name}" não está aberta: ${PREORDER_STATUS_LABEL[status]}.` },
            { status: 400 }
          )
        }
      }

      const variant = cartItem.variantId
        ? variants.find((v) => v.id === cartItem.variantId)
        : null
      if (cartItem.variantId) {
        if (!variant || variant.product_id !== product.id) {
          return NextResponse.json(
            { error: `Variante não encontrada para "${product.name}"` },
            { status: 404 }
          )
        }
        if (!variant.is_active || variant.is_sold_out) {
          return NextResponse.json(
            {
              error: `Variante indisponível: ${product.name} · ${variant.label}`,
            },
            { status: 400 }
          )
        }
      }

      const options = cartItem.optionIds
        .map((id) => variantOptions.find((o) => o.id === id))
        .filter((o): o is (typeof variantOptions)[number] => o != null)
      if (options.length !== cartItem.optionIds.length) {
        return NextResponse.json(
          { error: `Variante não encontrada para "${product.name}"` },
          { status: 404 }
        )
      }
      for (const option of options) {
        if (option.group.product_id !== product.id) {
          return NextResponse.json(
            { error: `Variante não encontrada para "${product.name}"` },
            { status: 404 }
          )
        }
        if (option.is_sold_out) {
          return NextResponse.json(
            {
              error: `Variante indisponível: ${product.name} · ${option.label}`,
            },
            { status: 400 }
          )
        }
      }
      // Uma opção por grupo, no máximo.
      if (new Set(options.map((o) => o.group.id)).size !== options.length) {
        return NextResponse.json(
          {
            error: `Selecione só uma opção por grupo de variantes: "${product.name}"`,
          },
          { status: 400 }
        )
      }

      // E no MÍNIMO: variante (se o produto tem) e uma opção de cada grupo —
      // a regra do botão "Comprar" da página, imposta aqui porque o corpo da
      // requisição é do cliente. Sem isto, mandar só o `productId` caía no
      // preço base e no estoque do produto (ilimitado quando quem controla
      // são as variantes). Ver `getSelectionRulesForCheckout`.
      const rules = selectionRules.get(product.id)
      const chosenGroups = new Set(options.map((o) => o.group.id))
      if (
        !rules ||
        (rules.requiresVariant && !variant) ||
        (!rules.requiresVariant && variant) ||
        rules.groupIds.some((groupId) => !chosenGroups.has(groupId))
      ) {
        return NextResponse.json(
          { error: `Escolha a versão de "${product.name}" na página do produto e adicione de novo ao carrinho.` },
          { status: 400 }
        )
      }

      const sortedOptions = [...options].sort(
        (a, b) => a.group.position - b.group.position
      )
      const selection = resolveSelection(
        product,
        variant ?? null,
        sortedOptions,
        skus.filter((sku) => sku.product_id === product.id)
      )

      // Combinação esgotada à mão: cor e opção podem estar à venda sozinhas
      // e bloqueadas juntas (ver store_product_skus.is_sold_out).
      if (selection.sku?.is_sold_out) {
        const label = [variant?.label, ...sortedOptions.map((o) => o.label)]
          .filter(Boolean)
          .join(" + ")
        return NextResponse.json(
          { error: `Combinação indisponível: ${product.name} · ${label}` },
          { status: 400 }
        )
      }

      validatedLines.push({
        product,
        variant: variant ?? null,
        options: sortedOptions,
        selection,
        quantity: cartItem.quantity,
      })
    }

    // Pedido com item de pré-venda ganha um prazo de pagamento maior: não há
    // estoque preso esperando, e reserva de lançamento é a compra que mais
    // se beneficia de tempo para decidir.
    const hasPreOrderLine = validatedLines.some(
      (line) => line.product.sale_type === "pre_order"
    )
    const expirationMinutes = hasPreOrderLine
      ? PREORDER_PIX_EXPIRATION_MINUTES
      : PIX_EXPIRATION_MINUTES

    // Limite de 15un/produto/usuário a cada 24h — só para produtos SEM
    // controle de estoque (stock null), onde não há outro teto natural
    // fechando a compra (produto com estoque real já é limitado pelo
    // próprio estoque + o MAX_QUANTITY_PER_LINE acima). Sem essa política a
    // loja não tem como impedir alguém de "levar tudo" de um item digital/
    // sem estoque numa única conta. Agrega por produto (não por linha) —
    // duas variantes sem estoque do mesmo produto competem pelo mesmo teto.
    const unlimitedStockQuantityByProduct = new Map<string, number>()
    for (const line of validatedLines) {
      // Pré-venda tem teto próprio (`preorder_limit`), conferido na reserva —
      // o limite diário aqui é para produto sem NENHUM teto, e aplicá-lo à
      // pré-venda limitaria uma reserva de lançamento a 15 unidades/dia.
      if (line.product.sale_type === "pre_order") continue
      if (line.selection.stock !== null) continue
      unlimitedStockQuantityByProduct.set(
        line.product.id,
        (unlimitedStockQuantityByProduct.get(line.product.id) ?? 0) +
          line.quantity
      )
    }
    if (unlimitedStockQuantityByProduct.size > 0) {
      const checks = await Promise.all(
        [...unlimitedStockQuantityByProduct.entries()].map(
          async ([productId, quantity]) => {
            const alreadyBought = await getRecentProductPurchaseQuantity(
              user.id,
              productId
            )
            return { productId, quantity, alreadyBought }
          }
        )
      )
      // Sem a conta não há limite: recusar é o lado seguro (a pessoa tenta de
      // novo em instantes), liberar sem teto era o que acontecia antes.
      if (checks.some((c) => c.alreadyBought === null)) {
        return NextResponse.json(
          { error: "Não foi possível conferir o limite de compra agora. Tente novamente em instantes." },
          { status: 503 }
        )
      }
      const exceeded = checks.find(
        (c) => (c.alreadyBought ?? 0) + c.quantity > DAILY_PURCHASE_LIMIT_NO_STOCK
      )
      if (exceeded) {
        const product = products.find((p) => p.id === exceeded.productId)
        const remaining = Math.max(
          0,
          DAILY_PURCHASE_LIMIT_NO_STOCK - (exceeded.alreadyBought ?? 0)
        )
        return NextResponse.json(
          {
            error:
              remaining > 0
                ? `Limite diário atingido para "${product?.name ?? "produto"}": restam ${remaining} unidade(s) hoje.`
                : `Limite diário de ${DAILY_PURCHASE_LIMIT_NO_STOCK} unidades para "${product?.name ?? "produto"}" já foi atingido hoje.`,
          },
          { status: 400 }
        )
      }
    }

    // Reserva de estoque real (não só leitura): decrementa via RPC atômica
    // (`UPDATE ... WHERE stock >= quantity`) ANTES de chamar o gateway de
    // pagamento, para nunca gerar cobrança PIX quando não há estoque. Cada
    // linha é independente (produtos/variantes distintos), então os
    // decrementos rodam em paralelo em vez de round-trip por round-trip —
    // um carrinho com várias linhas não serializa mais a latência do banco.
    // Se qualquer linha falhar (outro pedido levou a última unidade entre a
    // leitura acima e esta chamada), reverte tudo que teve sucesso neste
    // request e aborta com 409 — não é mais um 400 de checagem estática, é
    // uma corrida real sendo resolvida.
    const decrementResults = await Promise.all(
      validatedLines.map(async (line) => {
        const { product, variant, selection, quantity } = line

        // Pré-venda não tem estoque físico para descontar — o lote ainda vai
        // chegar. O teto é `preorder_limit`, e a RPC confere e registra a
        // reserva no mesmo comando (é isso que impede dois checkouts
        // simultâneos de estourarem o lote). Ela já grava no diário, então
        // esta linha não entra em `decrementedLines`.
        if (product.sale_type === "pre_order") {
          const { data: reserved } = await db.rpc("reserve_preorder", {
            p_product_id: product.id,
            p_quantity: quantity,
            p_reservation_group: reservationGroup,
          })
          // A página mostra as vagas que sobram no lote: muda a cada reserva.
          return { line, ok: Boolean(reserved), isPreOrder: true, stockControlled: Boolean(reserved) }
        }

        // A unidade sai de onde o estoque é controlado: a combinação, se
        // ela tem estoque próprio; senão a cor; senão o produto. Desconto e
        // linha no diário são uma transação só (`reserve_store_stock`).
        const reservation = await reserveStock(db, reservationGroup, {
          productId: product.id,
          variantId: variant?.id ?? null,
          skuId: selection.stockSource === "sku" ? selection.sku!.id : null,
          quantity,
        })
        return {
          line,
          ok: reservation.ok,
          isPreOrder: false,
          stockControlled: reservation.ok && reservation.remaining !== null,
        }
      })
    )

    for (const { line, ok, isPreOrder } of decrementResults) {
      // Pré-venda não mexeu no estoque, então não há o que reverter — e a
      // própria RPC já registrou a reserva no diário.
      if (!ok || isPreOrder) continue
      decrementedLines.push({
        productId: line.product.id,
        variantId: line.variant?.id ?? null,
        skuId: line.selection.stockSource === "sku" ? line.selection.sku!.id : null,
        quantity: line.quantity,
      })
    }

    const failed = decrementResults.find((r) => !r.ok)
    if (failed) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      const { product, variant, options } = failed.line
      const label = [product.name, variant?.label, ...options.map((o) => o.label)]
        .filter(Boolean)
        .join(" · ")
      let error = `Estoque insuficiente para "${label}".`
      if (product.sale_type === "pre_order") {
        // `reserve_preorder` recusa por dois motivos: lote cheio ou lote que
        // não está aberto. A mensagem diz qual, com o mesmo nome da tela.
        const preorder = preorderInfo.get(product.id)?.preorder
        const status = preorder ? effectivePreorderStatus(preorder, product.is_sold_out) : "sold_out"
        error =
          status === "open" || status === "sold_out"
            ? `As reservas de pré-venda de "${label}" esgotaram.`
            : `A pré-venda de "${label}" não está aberta: ${PREORDER_STATUS_LABEL[status]}.`
      }
      return NextResponse.json({ error }, { status: 409 })
    }

    // Estoque reservado e já no diário (mesma transação): daqui em diante,
    // mesmo que o processo morra, o cron sabe que estas unidades foram
    // descontadas sem pedido e as devolve.
    //
    // A página do produto é ISR: sem isto ela seguiria anunciando "Em
    // estoque: N unidades" (ou o botão de comprar de um item que acabou) até
    // a próxima revalidação. Só o que tem estoque controlado — produto sem
    // controle não muda nada na página ao ser comprado.
    revalidateStoreProducts(
      decrementResults.filter((result) => result.stockControlled).map((result) => result.line.product.slug)
    )

    let totalCents = 0
    const orderItems = []
    for (const line of validatedLines) {
      const { product, variant, options, selection, quantity } = line
      // Mesma resolução que a página do produto usa para decidir o preço
      // exibido (`lib/store-sku.ts` → `lib/store-pricing.ts`), inclusive a
      // promoção e o preço da combinação. Antes isto era uma segunda
      // implementação que esquecia `promo_price_cents`, e a loja cobrava o
      // preço cheio de um produto anunciado com desconto.
      const effectivePriceCents = complementCharge ? complementCharge.amountCents : selection.price.effectiveCents
      const singlePrice = isSinglePriceProduct(product)
      // Complemento não pede formulário nem abre atendimento: ele paga o
      // serviço de OUTRO pedido, que já tem os dois.
      const serviceForm = singlePrice && !complementCharge ? readServiceFormFields(product.service_form_fields) : []

      totalCents += effectivePriceCents * quantity
      orderItems.push({
        id: product.id,
        name: product.name,
        price_cents: effectivePriceCents,
        quantity,
        // Snapshot do tipo de venda: depois da compra o produto vira
        // "normal" (o admin troca quando o lote chega), e sem isto não há
        // como o pedido saber que foi uma reserva de pré-venda — que é
        // justamente o que explica a espera para quem comprou.
        sale_type: product.sale_type,
        variant_id: variant?.id ?? null,
        // Complemento: o rótulo é o pedido pago, que aparece no e-mail, em
        // Meus Pedidos e como descrição do item na página de cartão.
        variant_label: complementCharge ? `Pedido #${complementCharge.targetNumber}` : (variant?.label ?? null),
        variant_options: options.map((o) => ({
          group: o.group.name,
          label: o.label,
        })),
        // Código da combinação, para a separação do pedido. `sku_stock` diz
        // se a unidade saiu do estoque DELA (é o que a devolução lê).
        sku_id: selection.sku?.id ?? null,
        sku: selection.skuCode,
        sku_stock: selection.stockSource === "sku" && product.sale_type !== "pre_order",
        // Serviço: preço único e chamado de suporte aberto no pagamento.
        single_price: singlePrice,
        is_service: singlePrice && !complementCharge,
        // Qual pedido este complemento paga: o item é o que aparece no recibo,
        // no e-mail e no painel do gateway, sem precisar abrir o pedido.
        ...(complementCharge
          ? { complement_for: { order_id: complementCharge.targetOrderId, order_number: complementCharge.targetNumber } }
          : {}),
        // Campos que o comprador preenche depois de pagar. Snapshot: mudar o
        // produto depois não muda o que este pedido pede.
        ...(serviceForm.length > 0 ? { service_form: serviceForm } : {}),
        preorder_batch: preorderInfo.get(product.id)?.preorder?.batchName ?? null,
        image: selection.image ?? product.images?.[0] ?? null,
      })
    }

    if (totalCents <= 0) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      return NextResponse.json(
        { error: "Valor do pedido inválido." },
        { status: 400 }
      )
    }

    // Uma leitura só do perfil: o endereço de cobrança (cartão) vem junto.
    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name, cpf, asaas_customer_id, phone, postal_code, street, number, complement, neighborhood, city, state")
      .eq("id", user.id)
      .single()
    let payerName: string | null = profile?.full_name ?? null
    let payerDocument: string | null = profile?.cpf ?? null
    const customerEmail: string | null = user.email
    const cachedAsaasCustomerId: string | null =
      profile?.asaas_customer_id ?? null

    // Perfil sem nome/CPF: o próprio checkout aceita esses dados no corpo
    // da requisição (a tela mostra os campos quando o perfil está
    // incompleto) e completa o cadastro aqui, sem mandar a pessoa para Minha
    // conta (Dados de compra) no meio da compra. O corpo também chega com o perfil
    // já completo quando o usuário clica em "Editar" no card de dados da
    // cobrança: nesse caso o que ele digitou vale mais que o que está salvo.
    const payerInfoSubmitted =
      parsedBody.data.guestName !== undefined ||
      parsedBody.data.guestDocument !== undefined
    if (!payerName || !payerDocument || payerInfoSubmitted) {
      const payer = payerInfoSchema.safeParse(parsedBody.data)
      if (!payer.success) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        return NextResponse.json(
          {
            error:
              payer.error.issues[0]?.message ??
              "Informe seu nome e CPF para finalizar a compra.",
          },
          { status: 400 }
        )
      }
      payerName = payer.data.guestName
      payerDocument = payer.data.guestDocument

      const { error: profileUpdateError } = await db
        .from("user_profiles")
        .update({ full_name: payerName, cpf: payerDocument })
        .eq("id", user.id)
      if (profileUpdateError) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        const { body: errBody, status } = dbErrorResponse(
          profileUpdateError,
          "Não foi possível salvar seus dados. Tente novamente."
        )
        return NextResponse.json(errBody, { status })
      }
    }

    // Ambos os gateways exigem nome e CPF do pagador para emitir o PIX.
    if (!payerName || !payerDocument) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      return NextResponse.json(
        { error: "Informe seu nome e CPF para finalizar a compra." },
        { status: 400 }
      )
    }

    // Limite por CLIENTE (`max_per_customer`, lançamento disputado): a conta
    // OU o CPF do pagador. Só dá para conferir aqui, onde o CPF existe; as
    // unidades desta compra já estão reservadas e voltam se ela for recusada.
    // O CPF entra no pedido como impressão digital (HMAC), nunca em claro.
    const payerFingerprint = payerDocumentFingerprint(payerDocument)
    const customerLimits = complementCharge
      ? ({ ok: true, available: true, limits: new Map<string, number>() } as const)
      : await getCustomerLimits(validatedLines.map((line) => line.product.id))
    if (!customerLimits.ok) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      return NextResponse.json(
        { error: "Não foi possível conferir o limite de compra agora. Tente novamente em instantes." },
        { status: 503 }
      )
    }
    // Só grava a coluna quando a migration que a cria já rodou.
    const payerColumns = customerLimits.available && payerFingerprint ? { payer_document_hash: payerFingerprint } : {}

    if (customerLimits.limits.size > 0) {
      // A trava por conta não cobre duas CONTAS com o mesmo CPF no mesmo
      // segundo: esta cobre, até o pedido existir (solta no `finally`).
      if (payerFingerprint) {
        payerLease = await acquireLease(`store_checkout_payer:${payerFingerprint}`, CHECKOUT_LEASE_SECONDS)
        if (!payerLease.acquired) {
          await revertDecrements(db, decrementedLines, reservationGroup)
          return NextResponse.json(
            payerLease.reason === "error"
              ? { error: "Não foi possível iniciar a compra agora. Tente novamente em instantes." }
              : { error: "Já existe uma compra em andamento com este CPF. Aguarde alguns segundos e tente de novo.", code: CHECKOUT_IN_PROGRESS_CODE },
            { status: payerLease.reason === "error" ? 503 : 409 }
          )
        }
      }

      const limitedIds = [...customerLimits.limits.keys()]
      const owned = await getCustomerProductQuantities({
        productIds: limitedIds,
        userId: user.id,
        payerFingerprint,
        isSandbox: isActiveGatewaySandbox(),
      })
      if (!owned) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        return NextResponse.json(
          { error: "Não foi possível conferir o limite de compra agora. Tente novamente em instantes." },
          { status: 503 }
        )
      }

      for (const productId of limitedIds) {
        const max = customerLimits.limits.get(productId)!
        const requested = validatedLines
          .filter((line) => line.product.id === productId)
          .reduce((sum, line) => sum + line.quantity, 0)
        const already = owned.get(productId) ?? 0
        if (already + requested <= max) continue

        await revertDecrements(db, decrementedLines, reservationGroup)
        const name = products.find((p) => p.id === productId)?.name ?? "este produto"
        const remaining = Math.max(0, max - already)
        return NextResponse.json(
          {
            error:
              remaining > 0
                ? `"${name}" tem limite de ${max} por cliente, e você já tem ${already} em pedidos. Dá para levar mais ${remaining}.`
                : `"${name}" tem limite de ${max} por cliente, e você já atingiu esse limite (pedidos pagos ou aguardando pagamento contam).`,
          },
          { status: 400 }
        )
      }
    }

    // Auto-indicação pelo CPF: só dá para checar aqui, onde o documento do
    // pagador finalmente existe. A compra segue normalmente — apenas deixa de
    // ser atribuída, mesma decisão do bloqueio por `user_id`.
    // Complemento não leva afiliado: é o repasse do produto orçado, não uma
    // venda nova que alguém trouxe.
    let affiliateForOrder = complementCharge ? null : affiliateAttribution
    if (
      affiliateForOrder &&
      (await isSelfReferral(
        db,
        affiliateForOrder.affiliateId,
        affiliateForOrder.affiliateUserId,
        payerDocument
      ))
    ) {
      affiliateForOrder = null
    }

    let payerAddress: {
      phone: string
      postalCode: string
      street: string
      number: string
      complement?: string
      neighborhood: string
      city: string
      state: string
    } | null = null

    // Cartão exige endereço/telefone completos no customer da Asaas (PIX
    // não precisa) — checa e, se faltar, aceita os dados no próprio corpo do
    // checkout (mesmo padrão de payerInfoSchema acima) e completa o perfil.
    if (paymentMethod === "credit_card") {
      const addressProfile = profile

      const hasCompleteAddress = Boolean(
        addressProfile?.phone &&
        addressProfile?.postal_code &&
        addressProfile?.street &&
        addressProfile?.number &&
        addressProfile?.neighborhood &&
        addressProfile?.city &&
        addressProfile?.state
      )

      const addressSubmitted =
        parsedBody.data.guestPostalCode !== undefined ||
        parsedBody.data.guestStreet !== undefined ||
        parsedBody.data.guestPhone !== undefined

      if (hasCompleteAddress && !addressSubmitted) {
        payerAddress = {
          phone: addressProfile!.phone!,
          postalCode: addressProfile!.postal_code!,
          street: addressProfile!.street!,
          number: addressProfile!.number!,
          complement: addressProfile!.complement ?? undefined,
          neighborhood: addressProfile!.neighborhood!,
          city: addressProfile!.city!,
          state: addressProfile!.state!,
        }
      } else {
        const address = payerAddressSchema.safeParse(parsedBody.data)
        if (!address.success) {
          await revertDecrements(db, decrementedLines, reservationGroup)
          return NextResponse.json(
            {
              error:
                address.error.issues[0]?.message ??
                "Informe seu telefone e endereço para pagar com cartão.",
            },
            { status: 400 }
          )
        }
        payerAddress = {
          phone: address.data.guestPhone,
          postalCode: address.data.guestPostalCode,
          street: address.data.guestStreet,
          number: address.data.guestNumber,
          complement: address.data.guestComplement,
          neighborhood: address.data.guestNeighborhood,
          city: address.data.guestCity,
          state: address.data.guestState,
        }

        const { error: addressUpdateError } = await db
          .from("user_profiles")
          .update({
            phone: payerAddress.phone,
            postal_code: payerAddress.postalCode,
            street: payerAddress.street,
            number: payerAddress.number,
            complement: payerAddress.complement ?? null,
            neighborhood: payerAddress.neighborhood,
            city: payerAddress.city,
            state: payerAddress.state,
          })
          .eq("id", user.id)
        if (addressUpdateError) {
          await revertDecrements(db, decrementedLines, reservationGroup)
          const { body: errBody, status } = dbErrorResponse(
            addressUpdateError,
            "Não foi possível salvar seu endereço. Tente novamente."
          )
          return NextResponse.json(errBody, { status })
        }
      }
    }

    // -----------------------------------------------------------------
    // Endereço de ENTREGA
    // -----------------------------------------------------------------
    // Só faz sentido pedir se o carrinho tem algo para despachar — a decisão
    // vem da coluna `requires_shipping` de cada produto, nunca de uma
    // suposição de que "tudo na loja é físico": um serviço não deve travar o
    // checkout pedindo CEP.
    const needsShipping = orderNeedsShippingAddress(validatedLines)

    const shippingParse = parseOptionalShippingAddress(parsedBody.data)
    if (!shippingParse.ok) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      return NextResponse.json({ error: shippingParse.error }, { status: 400 })
    }
    let shippingAddress = shippingParse.address

    // O endereço NUNCA bloqueia a compra: quem não informar aqui fecha o
    // pedido do mesmo jeito e completa depois de pagar, em "Meus Pedidos"
    // (`awaiting_shipping_info`). Pedir CEP antes do pagamento é o que mais
    // derruba conversão no checkout, e o dado só é necessário para despachar.

    // Endereço informado num carrinho que não precisa de envio é descartado —
    // não guardamos PII que o pedido não usa (minimização, LGPD Art. 6, III).
    if (!needsShipping) shippingAddress = null

    // Reaproveita nome e telefone já conhecidos quando o cliente não os
    // digitou: quem recebe é, por padrão, quem comprou.
    const shippingColumns = shippingAddress
      ? {
          ...shippingAddressColumns(shippingAddress),
          shipping_address_filled_at: new Date().toISOString(),
          requires_shipping_address: needsShipping,
        }
      : { requires_shipping_address: needsShipping }

    // Guarda o endereço no perfil para pré-preencher a próxima compra, nas
    // colunas `shipping_*` — NUNCA nas de cobrança. Entrega e cobrança
    // dividiam as mesmas colunas, então comprar para presentear sobrescrevia
    // o endereço de cobrança do titular com o do presenteado, e ele voltava
    // para a Asaas como endereço do dono do cartão na compra seguinte.
    //
    // Falha aqui não derruba o checkout: o dado que importa para despachar é
    // o snapshot no pedido, gravado logo abaixo no mesmo insert.
    if (shippingAddress) {
      const { error: shippingProfileError } = await db
        .from("user_profiles")
        .update(shippingAddressColumns(shippingAddress))
        .eq("id", user.id)
      if (shippingProfileError) {
        console.error(
          "[checkout] falha ao salvar endereço de entrega no perfil:",
          shippingProfileError
        )
      }
    }

    // Texto da cobrança no painel do gateway: o que foi comprado, para quem
    // olha a transação saber do que se trata sem abrir o pedido no admin.
    const itemsSummary = complementCharge
      ? `Complemento do pedido #${complementCharge.targetNumber}`
      : summarizeChargeItems(orderItems)
    const description = `Pedido Sunano - ${itemsSummary}`
    // Gravado em todo insert abaixo (os três ramos de gateway).
    const complementColumns = complementCharge ? { complement_for_order_id: complementCharge.targetOrderId } : {}

    // Quem cobra ESTE pedido: o gateway é escolhido por forma de pagamento
    // (`STORE_PIX_GATEWAY` / `STORE_CARD_GATEWAY`, em lib/server/payments/gateway.ts).
    // Tudo acima (preço, estoque, afiliado, endereço) é o mesmo para todos;
    // daqui pra baixo só muda quem emite a cobrança.
    const chargeGateway = paymentMethod === "credit_card" ? storeCardGateway() : storePixGateway()

    // -----------------------------------------------------------------
    // Mercado Pago (cartão, `STORE_CARD_GATEWAY=mercadopago`)
    // -----------------------------------------------------------------
    // O pedido nasce JUNTO com a cobrança: a tela só chama esta rota depois
    // que a pessoa digitou o cartão, com o token do Card Payment Brick. Antes
    // o pedido era criado ao escolher "cartão" e só então o formulário
    // aparecia, e quem desistia na tela do cartão deixava um pedido pendente
    // segurando estoque, um aviso em Meus Pedidos e uma thread no Discord.
    //
    // A linha é gravada ANTES de chamar o Mercado Pago (e não depois de
    // aprovado) porque o webhook acha o pedido pelo `external_reference`:
    // aprovado com a Function morrendo antes do insert seria dinheiro
    // cobrado sem pedido. Recusado, a linha é apagada — ninguém foi avisado
    // dela e nenhuma tabela aponta para ela ainda.
    if (chargeGateway === "mercadopago") {
      const card = parsedBody.data.card!
      const settings = await getStoreSettings()
      // Mesmo helper do carrinho e da tela: o valor cobrado tem que bater
      // centavo a centavo com o que o cliente viu. Serviço entra sem acréscimo.
      const cardTotalCents = computeCardTotalCents(
        orderItems.map((item) => ({
          priceCents: item.price_cents,
          quantity: item.quantity,
          singlePrice: item.single_price,
        })),
        settings.cardSurchargePercent
      )

      const { data: order, error: insertError } = await db
        .from("store_orders")
        .insert({
          ...shippingColumns,
          ...complementColumns,
          ...payerColumns,
          payment_gateway: "mercadopago",
          items: orderItems,
          total_cents: cardTotalCents,
          pix_price_cents: totalCents,
          card_surcharge_percent: settings.cardSurchargePercent,
          status: "pending",
          payment_method: "credit_card",
          customer_email: customerEmail,
          customer_name: payerName,
          // Prazo da LOJA, lido pelo cron de expiração (ver o ramo de cartão
          // da Asaas abaixo para o porquê do nome). Só conta quando o cartão
          // fica em análise ou a resposta não chega: aí o pedido segue
          // pendente e a nova tentativa vai por `/checkout/card`.
          pix_expires_at: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
          is_sandbox: isActiveGatewaySandbox(),
          user_id: user.id,
          metadata: { user_id: user.id },
          affiliate_id: affiliateForOrder?.affiliateId ?? null,
          affiliate_code: affiliateForOrder?.affiliateCode ?? null,
        })
        .select("id")
        .single()

      if (insertError || !order) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        const { body, status } = dbErrorResponse(insertError, "Não foi possível registrar o pedido.")
        return NextResponse.json(body, { status })
      }

      // O pedido passa a segurar o estoque. Baixar o diário só depois da
      // cobrança faria o cron (15 min) e a expiração do pedido devolverem a
      // mesma unidade duas vezes se a Function morresse no meio da chamada.
      await confirmReservation()

      // Recusado: o pedido some e o estoque volta. O DELETE é condicional
      // (pendente, sem pagamento gravado), e só quem apagou devolve — se a
      // linha mudou no meio, ela é de outro fluxo agora.
      const discardOrder = async () => {
        const { data: deleted, error: deleteError } = await db
          .from("store_orders")
          .delete()
          .eq("id", order.id)
          .eq("status", "pending")
          .is("mercadopago_payment_id", null)
          .select("id")
        if (deleteError || !deleted?.length) {
          console.error("[checkout] pedido de cartão recusado não pôde ser descartado:", order.id, deleteError)
          return
        }
        await revertDecrements(db, decrementedLines)
      }

      // Em análise ou sem resposta: o pedido fica, pendente, e passa a ser
      // um pedido como os outros (aviso ao cliente e thread no Discord).
      const keepPending = async () => {
        await notifyOrderStatusChange({ userId: user.id, orderId: order.id, status: "pending" })
        notifyDiscordOrderEventInBackground({ orderId: order.id, status: "pending", actor: "checkout" })
        return NextResponse.json({ orderId: order.id, cardPayment: true })
      }

      try {
        const result = await payMercadoPagoCardOrder(
          {
            id: order.id,
            status: "pending",
            totalCents: cardTotalCents,
            customerEmail,
            customerName: payerName,
            items: orderItems,
            cardSurchargePercent: settings.cardSurchargePercent,
          },
          {
            token: card.token,
            paymentMethodId: card.payment_method_id,
            installments: card.installments,
            identification: card.payer?.identification ?? null,
            deviceId: card.device_id ?? null,
          }
        )
        if (result.outcome === "declined") {
          await discardOrder()
          return NextResponse.json(
            { error: mercadoPagoDeclineMessage(result.statusDetail), declined: true },
            { status: 402 }
          )
        }
        if (result.outcome === "processing") return keepPending()
        // Aprovado: `applyMercadoPagoOrder` já marcou pago e avisou cliente,
        // e-mail e Discord. (`closed` não acontece num pedido de segundos
        // atrás; se acontecer, a tela de cartão mostra o estado real.)
        return NextResponse.json({ orderId: order.id, cardPayment: true })
      } catch (err) {
        console.error("[checkout] mercadopago:", err)
        // 4xx do Mercado Pago: o token expirou/foi usado ou algum dado não
        // bateu — nada foi cobrado, e a pessoa digita o cartão de novo.
        if (err instanceof MercadoPagoError && err.status >= 400 && err.status < 500) {
          await discardOrder()
          return NextResponse.json(
            { error: "Não foi possível validar os dados do cartão. Confira e tente de novo.", declined: true },
            { status: 402 }
          )
        }
        // Timeout/5xx: não dá para saber se cobrou. O pedido fica para o
        // webhook aplicar uma aprovação tardia; apagá-lo deixaria um
        // pagamento aprovado sem pedido.
        return keepPending()
      }
    }

    // -----------------------------------------------------------------
    // InfinitePay (cartão, `STORE_CARD_GATEWAY=infinitepay`)
    // -----------------------------------------------------------------
    // Checkout hospedado: o pedido nasce pendente com o link e o cliente paga
    // na página da InfinitePay, que o devolve para `/checkout/card`. Quem
    // libera é `applyInfinitePayPayment` (retorno e webhook), sempre depois
    // do `payment_check`.
    //
    // Ordem inversa à da Asaas: o pedido é gravado ANTES de o link existir.
    // Link criado sem pedido gravado é pagável e não tem o que liberar — e a
    // InfinitePay não tem API para cancelar link nem para estornar.
    if (chargeGateway === "infinitepay") {
      const settings = await getStoreSettings()
      const cardTotalCents = computeCardTotalCents(
        orderItems.map((item) => ({
          priceCents: item.price_cents,
          quantity: item.quantity,
          singlePrice: item.single_price,
        })),
        settings.cardSurchargePercent
      )
      const orderId = randomUUID()

      const { error: insertError } = await db.from("store_orders").insert({
        ...shippingColumns,
        ...complementColumns,
        ...payerColumns,
        id: orderId,
        payment_gateway: "infinitepay",
        items: orderItems,
        total_cents: cardTotalCents,
        pix_price_cents: totalCents,
        card_surcharge_percent: settings.cardSurchargePercent,
        status: "pending",
        payment_method: "credit_card",
        customer_email: customerEmail,
        customer_name: payerName,
        // Prazo da LOJA, lido pelo cron de expiração (ver o ramo de cartão da
        // Asaas abaixo para o porquê do nome). O link da InfinitePay NÃO
        // expira junto: pagamento depois disso vira aviso de estorno manual.
        pix_expires_at: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
        is_sandbox: isActiveGatewaySandbox(),
        user_id: user.id,
        metadata: { user_id: user.id },
        affiliate_id: affiliateForOrder?.affiliateId ?? null,
        affiliate_code: affiliateForOrder?.affiliateCode ?? null,
      })
      if (insertError) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        const { body, status } = dbErrorResponse(insertError, "Não foi possível registrar o pedido.")
        return NextResponse.json(body, { status })
      }
      await confirmReservation()

      let checkoutUrl: string
      try {
        const link = await createInfinitePayCheckoutLink({
          orderId,
          totalCents: cardTotalCents,
          items: orderItems.map((item) => ({
            description: item.name,
            quantity: item.quantity,
            unitPriceCents: computeItemCardPriceCents(item.price_cents, settings.cardSurchargePercent, item.single_price),
          })),
          fallbackDescription: `Pedido #${orderNumber(orderId)} - Sunano`,
          redirectUrl: `${SITE_URL}/checkout/card?orderId=${orderId}`,
          webhookUrl: infinitePayWebhookUrl(SITE_URL),
          customer: { name: payerName, email: customerEmail, phone: payerAddress?.phone ?? null },
          // Entrega quando o pedido tem; senão o endereço do cadastro, que o
          // cartão sempre exige (`payerAddress`).
          address: shippingAddress
            ? {
                postalCode: shippingAddress.shippingPostalCode,
                street: shippingAddress.shippingStreet,
                neighborhood: shippingAddress.shippingNeighborhood,
                number: shippingAddress.shippingNumber,
                complement: shippingAddress.shippingComplement ?? null,
              }
            : payerAddress
              ? {
                  postalCode: payerAddress.postalCode,
                  street: payerAddress.street,
                  neighborhood: payerAddress.neighborhood,
                  number: payerAddress.number,
                  complement: payerAddress.complement ?? null,
                }
              : null,
        })
        checkoutUrl = link.url
      } catch (linkError) {
        console.error("[checkout] InfinitePay createInfinitePayCheckoutLink falhou:", linkError)
        // Sem link, ninguém pode pagar este pedido: some, e o estoque volta.
        // DELETE condicional: só quem apagou devolve.
        const { data: deleted } = await db
          .from("store_orders")
          .delete()
          .eq("id", orderId)
          .eq("status", "pending")
          .is("infinitepay_transaction_nsu", null)
          .select("id")
        if (deleted?.length) await revertDecrements(db, decrementedLines)
        return NextResponse.json(
          { error: "Não foi possível iniciar o pagamento com cartão. Tente novamente ou use PIX." },
          { status: 402 }
        )
      }

      const { error: linkSaveError } = await db
        .from("store_orders")
        .update({ infinitepay_checkout_url: checkoutUrl })
        .eq("id", orderId)
      if (linkSaveError) {
        // O cliente segue para o link mesmo assim; só a volta a ele por
        // `/checkout/card` fica sem o botão.
        console.error("[checkout] InfinitePay: falha ao gravar o link no pedido:", orderId, linkSaveError)
      }

      await notifyOrderStatusChange({ userId: user.id, orderId, status: "pending" })
      notifyDiscordOrderEventInBackground({ orderId, status: "pending", actor: "checkout" })

      return NextResponse.json({ orderId, checkoutUrl })
    }

    // -----------------------------------------------------------------
    // Stripe (`STORE_PIX_GATEWAY=stripe` / `STORE_CARD_GATEWAY=stripe`)
    // -----------------------------------------------------------------
    // A Asaas segue sendo o padrão e o fluxo dela, logo abaixo, não passa
    // por este bloco.
    if (chargeGateway === "stripe") {
      // Id do pedido antes da cobrança: ele vai no metadata do Stripe e é por
      // ele (e pelo id da cobrança) que o webhook acha o pedido.
      const orderId = randomUUID()
      // Aqui o id já existe: o número é o mesmo de "Meus pedidos" e do admin.
      const stripeDescription = `Pedido #${orderNumber(orderId)} · ${itemsSummary}`
      const isSandbox = isActiveGatewaySandbox()
      const pixExpiresAt = new Date(Date.now() + expirationMinutes * 60_000).toISOString()

      let stripeInsert: Partial<Database["public"]["Tables"]["store_orders"]["Insert"]> & { total_cents: number }
      let undoCharge: () => Promise<void>
      let response: Record<string, unknown>

      if (paymentMethod === "credit_card") {
        const settings = await getStoreSettings()
        const cardTotalCents = computeCardTotalCents(
          orderItems.map((item) => ({
            priceCents: item.price_cents,
            quantity: item.quantity,
            singlePrice: item.single_price,
          })),
          settings.cardSurchargePercent
        )

        // Cartão no NOSSO site: aqui só nasce o PaymentIntent (valor fixado
        // no servidor, captura manual). O cartão é digitado em
        // `/checkout/card` no Payment Element e confirmado pela rota
        // `/api/store/orders/[id]/card-payment`. Sem parcelamento: o Stripe
        // Brasil não oferece planos de parcelas.
        let cardPayment
        try {
          cardPayment = await createStripeCardPayment({
            orderId,
            description: stripeDescription,
            amountCents: cardTotalCents,
            customerEmail,
          })
        } catch (cardError) {
          console.error("[checkout] Stripe createStripeCardPayment falhou:", cardError)
          await revertDecrements(db, decrementedLines, reservationGroup)
          return NextResponse.json(
            { error: "Não foi possível iniciar o pagamento com cartão. Tente novamente ou use PIX." },
            { status: 402 }
          )
        }

        stripeInsert = {
          id: orderId,
          stripe_payment_intent_id: cardPayment.paymentIntentId,
          total_cents: cardTotalCents,
          payment_method: "credit_card",
          pix_price_cents: totalCents,
          card_surcharge_percent: settings.cardSurchargePercent,
          installment_count: 1,
          // Prazo da LOJA, lido pelo cron de expiração (ver o ramo de cartão
          // da Asaas abaixo para o porquê do nome). Ao expirar, o cron
          // cancela o PaymentIntent e o cartão deixa de ser autorizável.
          pix_expires_at: pixExpiresAt,
        }
        undoCharge = () => cancelStripePayment(cardPayment.paymentIntentId)
        // Sem `checkoutUrl`: a tela segue para `/checkout/card` (formulário nosso).
        response = { orderId, cardPayment: true }
      } else {
        const pix = await createStripePixPayment({
          orderId,
          amountCents: totalCents,
          description: stripeDescription,
          payerName,
          payerEmail: customerEmail,
          payerDocument,
          expiresInSeconds: expirationMinutes * 60,
        })

        stripeInsert = {
          id: orderId,
          stripe_payment_intent_id: pix.paymentIntentId,
          total_cents: totalCents,
          payment_method: "pix",
          pix_copy_paste: pix.copyPaste,
          pix_qr_code_base64: pix.qrCodeDataUri,
          pix_expires_at: pixExpiresAt,
        }
        undoCharge = () => cancelStripePayment(pix.paymentIntentId)
        response = { orderId, qrCodeBase64: pix.qrCodeDataUri, copyPaste: pix.copyPaste }
      }

      const { data: order, error: insertError } = await db
        .from("store_orders")
        .insert({
          ...stripeInsert,
          ...shippingColumns,
          ...complementColumns,
          ...payerColumns,
          items: orderItems,
          status: "pending",
          customer_email: customerEmail,
          customer_name: payerName,
          is_sandbox: isSandbox,
          user_id: user.id,
          metadata: { user_id: user.id },
          affiliate_id: affiliateForOrder?.affiliateId ?? null,
          affiliate_code: affiliateForOrder?.affiliateCode ?? null,
        })
        .select("id")
        .single()

      if (insertError || !order) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        // A cobrança já existe no Stripe e não tem pedido: fecha para ela não
        // ser paga por um pedido que nunca vai ser liberado.
        await undoCharge().catch((err) =>
          console.error("[checkout] Stripe: falha ao desfazer cobrança sem pedido:", err)
        )
        const { body, status } = dbErrorResponse(insertError, "Não foi possível registrar o pedido.")
        return NextResponse.json(body, { status })
      }

      await confirmReservation()
      await notifyOrderStatusChange({ userId: user.id, orderId: order.id, status: "pending" })
      notifyDiscordOrderEventInBackground({ orderId: order.id, status: "pending", actor: "checkout" })

      return NextResponse.json(response)
    }

    let orderInsert: Partial<
      Database["public"]["Tables"]["store_orders"]["Insert"]
    >
    let qrCodeBase64: string | null = null
    let copyPaste: string | null = null
    let checkoutUrl: string | null = null

    if (paymentMethod === "credit_card") {
      // Cartão é via Asaas Checkout hospedado. O cliente digita os dados na
      // página da própria Asaas; nosso backend nunca recebe número de
      // cartão, validade ou CVV (ver createCheckout).
      const settings = await getStoreSettings()
      // Mesmo helper usado no carrinho e no checkout do cliente — o valor
      // cobrado aqui tem que bater com o que a tela mostrou, centavo a
      // centavo. Serviço entra sem o acréscimo (preço único).
      const cardTotalCents = computeCardTotalCents(
        orderItems.map((item) => ({
          priceCents: item.price_cents,
          quantity: item.quantity,
          singlePrice: item.single_price,
        })),
        settings.cardSurchargePercent
      )

      const customer = await findOrCreateCustomer({
        name: payerName,
        cpfCnpj: payerDocument,
        email: customerEmail,
        phone: payerAddress!.phone,
        postalCode: payerAddress!.postalCode,
        address: payerAddress!.street,
        addressNumber: payerAddress!.number,
        complement: payerAddress!.complement,
        province: payerAddress!.neighborhood,
        city: payerAddress!.city,
        state: payerAddress!.state,
      })
      if (customer.id !== cachedAsaasCustomerId) {
        await db
          .from("user_profiles")
          .update({ asaas_customer_id: customer.id })
          .eq("id", user.id)
      }

      // Gera o id do pedido antes do insert (Supabase aceita PK explícita)
      // para poder apontar `successUrl` pra ele — diferente do fluxo PIX,
      // aqui o cliente é redirecionado de volta pro nosso site, então
      // precisamos do id real ANTES de criar o checkout na Asaas, não só de
      // uma referência opaca. externalReference usa o mesmo id (não vaza
      // nada novo: é o id do próprio pedido que o cliente já vai ver na URL).
      const orderId = randomUUID()

      let checkout
      try {
        checkout = await createCheckout({
          customerId: customer.id,
          totalCents: cardTotalCents,
          items: buildAsaasCheckoutItems(
            orderItems,
            cardTotalCents,
            settings.cardSurchargePercent
          ),
          externalReference: orderId,
          maxInstallments: settings.cardMaxInstallments,
          successUrl: `${SITE_URL}/checkout/card?orderId=${orderId}`,
          cancelUrl: `${SITE_URL}/checkout`,
          expiredUrl: `${SITE_URL}/checkout`,
          minutesToExpire: expirationMinutes,
        })
      } catch (checkoutError) {
        // Falha ao criar o checkout na Asaas (ex.: cartão de teste inválido
        // em sandbox, erro de validação) — reverte a reserva de estoque
        // imediatamente aqui, sem esperar cair no catch externo genérico,
        // pra devolver uma mensagem específica de cartão recusado/indisponível.
        console.error("[checkout] createCheckout falhou:", checkoutError)
        await revertDecrements(db, decrementedLines, reservationGroup)
        return NextResponse.json(
          {
            error:
              "Não foi possível iniciar o pagamento com cartão. Tente novamente ou use PIX.",
          },
          { status: 402 }
        )
      }

      orderInsert = {
        id: orderId,
        asaas_checkout_id: checkout.id,
        asaas_customer_id: customer.id,
        pix_price_cents: totalCents,
        card_surcharge_percent: settings.cardSurchargePercent,
        // Apesar do nome, é o prazo que a LOJA impõe e a coluna que o cron de
        // expiração lê. Sem ela o pedido de cartão caía no fallback de
        // PIX_EXPIRATION_MINUTES: pré-venda no cartão expirava (e liberava a
        // vaga do lote) em 60 min enquanto o link da Asaas seguia pagável por
        // 24h. A tela do PIX é a única que mostra este campo.
        pix_expires_at: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
      }
      checkoutUrl = checkout.link

      const { data: order, error: insertError } = await db
        .from("store_orders")
        .insert({
          ...orderInsert,
          ...shippingColumns,
          ...complementColumns,
          ...payerColumns,
          items: orderItems,
          total_cents: cardTotalCents,
          status: "pending",
          payment_method: "credit_card",
          customer_email: customerEmail,
          customer_name: payerName,
          // Marca de ambiente congelada no pedido: o que a Asaas cobrou aqui
          // foi dinheiro de verdade ou de teste. `ASAAS_ENV` só existe em
          // runtime — sem gravar, um pedido de sandbox fica indistinguível de
          // um real depois que o deploy vira produção.
          is_sandbox: isActiveGatewaySandbox(),
          user_id: user.id,
          metadata: { user_id: user.id },
          affiliate_id: affiliateForOrder?.affiliateId ?? null,
          affiliate_code: affiliateForOrder?.affiliateCode ?? null,
        })
        .select("id")
        .single()

      if (insertError || !order) {
        await revertDecrements(db, decrementedLines, reservationGroup)
        const { body, status } = dbErrorResponse(
          insertError,
          "Não foi possível registrar o pedido."
        )
        return NextResponse.json(body, { status })
      }

      await confirmReservation()

      await notifyOrderStatusChange({
        userId: user.id,
        orderId: order.id,
        status: "pending",
      })

      // Sem `await`: aqui o cliente está esperando o checkout abrir, e uma
      // ida ao Discord (criar thread + duas mensagens) somaria centenas de ms
      // a uma resposta que precisa ser rápida. A thread pode nascer alguns
      // instantes depois — e se este for o único ponto que ela perder, o
      // evento seguinte (`paid`) a cria do mesmo jeito.
      notifyDiscordOrderEventInBackground({
        orderId: order.id,
        status: "pending",
        actor: "checkout",
      })

      return NextResponse.json({ orderId: order.id, checkoutUrl })
    }

    // externalReference próprio (não o id do pedido) para não vazar UUID
    // interno do banco na integração externa, e para poder criar o pedido
    // depois de já ter o id da cobrança.
    const externalReference = randomUUID()

    const customer = await findOrCreateCustomer({
      name: payerName,
      cpfCnpj: payerDocument,
      email: customerEmail,
    })

    // Cacheia o customer no perfil de usuários logados para não recriar
    // (nem depender da busca por CPF) na próxima compra.
    if (customer.id !== cachedAsaasCustomerId) {
      await db
        .from("user_profiles")
        .update({ asaas_customer_id: customer.id })
        .eq("id", user.id)
    }

    const payment = await createPixPayment({
      customerId: customer.id,
      amountCents: totalCents,
      description,
      externalReference,
    })

    const qrCode = await getPixQrCode(payment.id)

    qrCodeBase64 = qrCode.encodedImage
    copyPaste = qrCode.payload
    orderInsert = {
      asaas_payment_id: payment.id,
      asaas_customer_id: customer.id,
      pix_copy_paste: copyPaste,
      pix_qr_code_base64: qrCodeBase64,
      // Prazo que a LOJA impõe (o `expirationDate` da Asaas é de longa
      // validade e não reflete a política da loja). É esta coluna que a tela
      // do PIX mostra na contagem e que o cron de expiração aplica, então ela
      // precisa carregar a janela estendida da pré-venda.
      pix_expires_at: new Date(
        Date.now() + expirationMinutes * 60_000
      ).toISOString(),
    }

    const { data: order, error: insertError } = await db
      .from("store_orders")
      .insert({
        ...orderInsert,
        ...shippingColumns,
        ...complementColumns,
        ...payerColumns,
        items: orderItems,
        total_cents: totalCents,
        status: "pending",
        payment_method: "pix",
        customer_email: customerEmail,
        customer_name: payerName,
        is_sandbox: isActiveGatewaySandbox(),
        user_id: user.id,
        metadata: { user_id: user.id },
        affiliate_id: affiliateForOrder?.affiliateId ?? null,
        affiliate_code: affiliateForOrder?.affiliateCode ?? null,
      })
      .select("id")
      .single()

    if (insertError || !order) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      const { body, status } = dbErrorResponse(
        insertError,
        "Não foi possível registrar o pedido."
      )
      return NextResponse.json(body, { status })
    }

    await confirmReservation()

    await notifyOrderStatusChange({
      userId: user.id,
      orderId: order.id,
      status: "pending",
    })

    // Sem `await` — mesma razão do ramo de cartão acima: a tela do PIX está
    // esperando o QR code, e a notificação não pode entrar nesse caminho.
    notifyDiscordOrderEventInBackground({
      orderId: order.id,
      status: "pending",
      actor: "checkout",
    })

    return NextResponse.json({
      orderId: order.id,
      qrCodeBase64,
      copyPaste,
    })
  } catch (err) {
    console.error("Checkout error:", err)
    // Sempre pelo grupo, mesmo sem `decrementedLines`: um carrinho só de
    // pré-venda também deixou linha no diário (`reserve_preorder`), e ela
    // seguraria a vaga do lote por 15 min até o cron. Depois de confirmada,
    // a reserva é do pedido (ver `reservationConfirmed`).
    if (!reservationConfirmed) {
      await revertDecrements(db, decrementedLines, reservationGroup)
    }
    const { body, status } = dbErrorResponse(
      err,
      "Não foi possível finalizar a compra. Tente novamente."
    )
    return NextResponse.json(body, { status })
  } finally {
    await payerLease?.release()
    await checkoutLease?.release()
  }
}
