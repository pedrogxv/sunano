import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import {
  findOrCreateCustomer,
  createPixPayment,
  getPixQrCode,
  createCheckout,
  isSandboxGateway,
  type AsaasCheckoutItem,
} from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import {
  payerInfoSchema,
  payerAddressSchema,
} from "@/lib/server/validation/guest-checkout"
import {
  orderNeedsShippingAddress,
  parseOptionalShippingAddress,
} from "@/lib/server/validation/shipping-address"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { dbErrorResponse } from "@/lib/db-errors"
import {
  getVariantsForCheckout,
  getVariantOptionsForCheckout,
  getRecentProductPurchaseQuantity,
  getSoldOutCombinations,
  DAILY_PURCHASE_LIMIT_NO_STOCK,
} from "@/lib/server/repositories/store-repository"
import {
  PIX_EXPIRATION_MINUTES,
  PREORDER_PIX_EXPIRATION_MINUTES,
} from "@/lib/server/repositories/orders-repository"
import { getStoreSettings } from "@/lib/server/repositories/store-settings-repository"
import { getAffiliateByCode } from "@/lib/server/repositories/affiliates-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEventInBackground } from "@/lib/server/repositories/discord-orders-repository"
import { isWebMaster } from "@/lib/admin-permissions"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { computeCardPriceCents, computeEffectivePrice } from "@/lib/store-pricing"
import { SITE_URL } from "@/lib/site-url"
import type { Database } from "@/lib/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 20

type DecrementedLine = {
  productId: string
  variantId: string | null
  quantity: number
}

const MAX_ITEM_LINES = 50
const MAX_QUANTITY_PER_LINE = 20

const AFFILIATE_REF_COOKIE = "sn_aff_ref"
const AFFILIATE_REF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const checkoutItemSchema = z.object({
  productId: z
    .string("Quantidade inválida no carrinho.")
    .min(1, "Quantidade inválida no carrinho."),
  variantId: z.string().min(1, "Quantidade inválida no carrinho.").nullish(),
  variantOptionIds: z
    .array(z.string().min(1, "Quantidade inválida no carrinho."))
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
  shippingPhone: z.unknown().optional(),
  shippingPostalCode: z.unknown().optional(),
  shippingStreet: z.unknown().optional(),
  shippingNumber: z.unknown().optional(),
  shippingComplement: z.unknown().optional(),
  shippingNeighborhood: z.unknown().optional(),
  shippingCity: z.unknown().optional(),
  shippingState: z.unknown().optional(),
  /** Marca explícita de "não quero informar agora" — só aceita enquanto o endereço for opcional. */
})

/**
 * Resolve o afiliado a atribuir a esta venda a partir do cookie gravado pelo
 * proxy (`?ref=CODIGO`), se ainda dentro da janela de 30 dias e se o código
 * corresponde a um afiliado aprovado. Bloqueia auto-indicação silenciosamente
 * — o comprador logado com o próprio código não gera comissão para si mesmo,
 * mas a compra segue normalmente (não é motivo pra recusar o checkout).
 */
async function resolveAffiliateAttribution(
  request: NextRequest,
  userId: string | null
): Promise<{ affiliateId: string; affiliateCode: string } | null> {
  const raw = request.cookies.get(AFFILIATE_REF_COOKIE)?.value
  if (!raw) return null

  let parsed: { code?: unknown; clickedAt?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed.code !== "string" || typeof parsed.clickedAt !== "number")
    return null
  if (Date.now() - parsed.clickedAt > AFFILIATE_REF_MAX_AGE_MS) return null

  const affiliate = await getAffiliateByCode(parsed.code)
  if (!affiliate) return null
  if (userId && affiliate.user_id === userId) return null

  return { affiliateId: affiliate.id, affiliateCode: parsed.code }
}

/**
 * Reverte as reservas de estoque já aplicadas neste request (RPC atômica de
 * incremento, mesmo padrão de segurança do decremento). Chamada em qualquer
 * caminho de erro depois que pelo menos uma linha foi decrementada — não há
 * transação real via PostgREST entre o decremento e o insert do pedido, então
 * o rollback é manual.
 */
async function revertDecrements(
  db: SupabaseClient<Database>,
  lines: DecrementedLine[],
  reservationGroup?: string
) {
  // Apaga o diário ANTES de devolver o estoque: se o processo morrer no meio
  // desta função, a alternativa (diário apagado e estoque não devolvido)
  // seria invisível, enquanto esta ordem deixa o cron devolver de novo — e a
  // RPC de release só age sobre linhas que ainda existem, então no pior caso
  // o estoque volta uma vez só.
  if (reservationGroup) {
    await db
      .from("store_stock_reservations")
      .delete()
      .eq("reservation_group", reservationGroup)
  }

  await Promise.all(
    lines.map(async (line) => {
      try {
        if (line.variantId) {
          await db.rpc("increment_variant_stock", {
            p_variant_id: line.variantId,
            p_quantity: line.quantity,
          })
        } else {
          await db.rpc("increment_store_stock", {
            p_product_id: line.productId,
            p_quantity: line.quantity,
          })
        }
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
 * o TOTAL (`computeCardPriceCents(totalCents, …)`), não item a item:
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
      unitPriceCents: computeCardPriceCents(item.price_cents, cardSurchargePercent),
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

  // Segunda checagem da mesma flag que o proxy já aplica (proxy.ts) — fechado
  // por padrão, caso o matcher/lógica do proxy mude e essa rota deixe de
  // passar por lá. WEB MASTER ignora a manutenção, igual no proxy.
  if (isStoreMaintenanceEnabled()) {
    const maintenanceUser = await getRequestUser(request)
    const { data: maintenanceProfile } = maintenanceUser
      ? await db
          .from("admin_profiles")
          .select("id, role, permissions")
          .eq("id", maintenanceUser.id)
          .maybeSingle()
      : { data: null }

    if (!isWebMaster(maintenanceProfile)) {
      return NextResponse.json(
        {
          error: "A Loja está temporariamente indisponível para novos pedidos.",
        },
        { status: 503 }
      )
    }
  }

  try {
    // Primeiro portão, ANTES de autenticar: só contém flood anônimo contra a
    // rota. O teto é folgado de propósito — o identificador é hash de IP+UA,
    // e CG-NAT/redes corporativas fazem compradores sem relação nenhuma
    // dividirem a mesma cota. Quem limita de verdade é o portão por usuário,
    // logo abaixo.
    const clientId = getClientIdentifier(request)
    const ipRateLimit = await checkRateLimit({
      action: "store_checkout_create_ip",
      identifier: clientId,
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

    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json(
        { error: "Você precisa estar logado para finalizar a compra." },
        { status: 401 }
      )
    }
    // Portão real: a cota é da CONTA, não do IP. Limitar só por IP+UA deixava
    // uma mesma conta renovar o limite a cada troca de rede (4G, VPN, proxy),
    // justamente na rota mais cara do fluxo — cada tentativa gera cobrança e
    // QR code na Asaas. Mesmo padrão de `PUT /orders/[id]/shipping-address`:
    // compõe usuário + cliente, então trocar de IP não zera a contagem.
    const userRateLimit = await checkRateLimit({
      action: "store_checkout_create",
      identifier: `${user.id}:${clientId}`,
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
          message: "Sessão de acesso é somente leitura — não é possível finalizar uma compra.",
        },
        { status: 403 }
      )
    }

    const affiliateAttribution = await resolveAffiliateAttribution(
      request,
      user.id
    )

    const rawBody = await request.json().catch(() => null)
    const parsedBody = checkoutBodySchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? "Carrinho inválido." },
        { status: 400 }
      )
    }
    const { items, paymentMethod } = parsedBody.data

    // Limite adicional (mais rígido) só pra tentativas de cartão, em cima do
    // limite geral acima — cartão é o alvo natural de spam/enumeração de
    // checkout mesmo sem receber dados de cartão de verdade (o link gerado
    // custa uma chamada na Asaas a cada tentativa). Ação separada do limite
    // geral pra não derrubar quem só está comprando PIX no mesmo IP.
    if (paymentMethod === "credit_card") {
      const cardRateLimit = await checkRateLimit({
        action: "store_checkout_card_attempt",
        identifier: `${user.id}:${clientId}`,
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
      soldOutCombinations,
    ] = await Promise.all([
      db
        .from("store_products")
        .select(
          "id, name, price_cents, promo_price_cents, stock, images, type, condition, is_active, is_sold_out, requires_shipping, sale_type"
        )
        .in("id", productIds),
      getVariantsForCheckout(variantIds),
      getVariantOptionsForCheckout(optionIds),
      getSoldOutCombinations(variantIds, optionIds),
    ])
    const soldOutCombinationKeys = new Set(
      soldOutCombinations.map((c) => `${c.variant_id}:${c.option_id}`)
    )

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

    // Validação síncrona (sem query) de cada linha antes de tocar o banco —
    // nenhum decremento acontece ainda aqui, então não precisa reverter nada
    // em caso de erro.
    type ValidatedLine = {
      product: (typeof products)[number]
      variant: (typeof variants)[number] | null
      options: (typeof variantOptions)[number][]
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
              error: `Variante indisponível: ${product.name} — ${variant.label}`,
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
              error: `Variante indisponível: ${product.name} — ${option.label}`,
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

      // Combinação Cor × Variante esgotada — checado à parte dos flags
      // isolados acima, já que uma cor e uma opção podem estar disponíveis
      // individualmente mas bloqueadas juntas (ver store_product_variant_combinations).
      if (variant) {
        for (const option of options) {
          if (soldOutCombinationKeys.has(`${variant.id}:${option.id}`)) {
            return NextResponse.json(
              {
                error: `Combinação indisponível: ${product.name} — ${variant.label} + ${option.label}`,
              },
              { status: 400 }
            )
          }
        }
      }

      validatedLines.push({
        product,
        variant: variant ?? null,
        options: [...options].sort(
          (a, b) => a.group.position - b.group.position
        ),
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
      const effectiveStock = line.variant
        ? line.variant.stock
        : line.product.stock
      if (effectiveStock !== null) continue
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
      const exceeded = checks.find(
        (c) => c.alreadyBought + c.quantity > DAILY_PURCHASE_LIMIT_NO_STOCK
      )
      if (exceeded) {
        const product = products.find((p) => p.id === exceeded.productId)
        const remaining = Math.max(
          0,
          DAILY_PURCHASE_LIMIT_NO_STOCK - exceeded.alreadyBought
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
        const { product, variant, quantity } = line

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
          return { line, ok: Boolean(reserved), isPreOrder: true }
        }

        if (variant) {
          const { data: decremented } = await db.rpc(
            "decrement_variant_stock",
            {
              p_variant_id: variant.id,
              p_quantity: quantity,
            }
          )
          return { line, ok: Boolean(decremented), isPreOrder: false }
        }
        const { data: decremented } = await db.rpc("decrement_store_stock", {
          p_product_id: product.id,
          p_quantity: quantity,
        })
        return { line, ok: Boolean(decremented), isPreOrder: false }
      })
    )

    for (const { line, ok, isPreOrder } of decrementResults) {
      // Pré-venda não mexeu no estoque, então não há o que reverter — e a
      // própria RPC já registrou a reserva no diário.
      if (!ok || isPreOrder) continue
      decrementedLines.push({
        productId: line.product.id,
        variantId: line.variant?.id ?? null,
        quantity: line.quantity,
      })
    }

    const failed = decrementResults.find((r) => !r.ok)
    if (failed) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      const { product, variant } = failed.line
      const label = variant
        ? `${product.name} — ${variant.label}`
        : product.name
      return NextResponse.json(
        {
          error:
            product.sale_type === "pre_order"
              ? `As reservas de pré-venda de "${label}" esgotaram.`
              : `Estoque insuficiente para "${label}".`,
        },
        { status: 409 }
      )
    }

    // Estoque reservado com sucesso: registra no diário ANTES de qualquer
    // chamada ao gateway. A partir daqui, mesmo que o processo morra, o cron
    // sabe que estas unidades foram descontadas sem pedido e as devolve.
    // Falha ao gravar o diário não derruba a compra — ela só nos deixa sem a
    // rede de segurança para este request, que é exatamente o comportamento
    // que existia antes de o diário existir.
    if (decrementedLines.length > 0) {
      const { error: journalError } = await db
        .from("store_stock_reservations")
        .insert(
          decrementedLines.map((line) => ({
            reservation_group: reservationGroup,
            product_id: line.productId,
            variant_id: line.variantId,
            quantity: line.quantity,
          }))
        )
      if (journalError) {
        console.error(
          "[checkout] falha ao registrar reserva de estoque no diário:",
          journalError
        )
      }
    }

    let totalCents = 0
    const orderItems = []
    for (const line of validatedLines) {
      const { product, variant, options, quantity } = line
      // Mesma função que a vitrine e a página de produto usam para decidir o
      // preço exibido (`lib/store-pricing.ts`) — inclusive a promoção. Antes
      // isto era uma segunda implementação que esquecia `promo_price_cents`,
      // e a loja cobrava o preço cheio de um produto anunciado com desconto.
      const { effectiveCents: effectivePriceCents } = computeEffectivePrice(
        product,
        variant,
        options
      )

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
        variant_label: variant?.label ?? null,
        variant_options: options.map((o) => ({
          group: o.group.name,
          label: o.label,
        })),
        image: product.images?.[0] ?? null,
      })
    }

    if (totalCents <= 0) {
      await revertDecrements(db, decrementedLines, reservationGroup)
      return NextResponse.json(
        { error: "Valor do pedido inválido." },
        { status: 400 }
      )
    }

    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name, cpf, asaas_customer_id")
      .eq("id", user.id)
      .single()
    let payerName: string | null = profile?.full_name ?? null
    let payerDocument: string | null = profile?.cpf ?? null
    const customerEmail: string | null = user.email
    const cachedAsaasCustomerId: string | null =
      profile?.asaas_customer_id ?? null

    // Perfil sem nome/CPF: o próprio checkout aceita esses dados no corpo
    // da requisição (a tela mostra os campos quando o perfil está
    // incompleto) e completa o cadastro aqui — não existe uma tela separada
    // de "editar perfil" para isso hoje. O corpo também chega com o perfil
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
      const { data: addressProfile } = await db
        .from("user_profiles")
        .select(
          "phone, postal_code, street, number, complement, neighborhood, city, state"
        )
        .eq("id", user.id)
        .single()

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
          shipping_recipient: shippingAddress.shippingRecipient,
          shipping_phone: shippingAddress.shippingPhone,
          shipping_postal_code: shippingAddress.shippingPostalCode,
          shipping_street: shippingAddress.shippingStreet,
          shipping_number: shippingAddress.shippingNumber,
          shipping_complement: shippingAddress.shippingComplement ?? null,
          shipping_neighborhood: shippingAddress.shippingNeighborhood,
          shipping_city: shippingAddress.shippingCity,
          shipping_state: shippingAddress.shippingState,
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
        .update({
          shipping_recipient: shippingAddress.shippingRecipient,
          shipping_phone: shippingAddress.shippingPhone,
          shipping_postal_code: shippingAddress.shippingPostalCode,
          shipping_street: shippingAddress.shippingStreet,
          shipping_number: shippingAddress.shippingNumber,
          shipping_complement: shippingAddress.shippingComplement ?? null,
          shipping_neighborhood: shippingAddress.shippingNeighborhood,
          shipping_city: shippingAddress.shippingCity,
          shipping_state: shippingAddress.shippingState,
        })
        .eq("id", user.id)
      if (shippingProfileError) {
        console.error(
          "[checkout] falha ao salvar endereço de entrega no perfil:",
          shippingProfileError
        )
      }
    }

    const description = `Pedido Sunano — ${orderItems.length} ${orderItems.length === 1 ? "item" : "itens"}`

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
      // Mesmo helper usado na vitrine/checkout do cliente — o valor cobrado
      // aqui tem que bater com o que a tela mostrou, centavo a centavo.
      const cardTotalCents = computeCardPriceCents(
        totalCents,
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
      }
      checkoutUrl = checkout.link

      const { data: order, error: insertError } = await db
        .from("store_orders")
        .insert({
          ...orderInsert,
          ...shippingColumns,
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
          is_sandbox: isSandboxGateway(),
          metadata: { user_id: user.id },
          affiliate_id: affiliateAttribution?.affiliateId ?? null,
          affiliate_code: affiliateAttribution?.affiliateCode ?? null,
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

      await confirmReservations(db, reservationGroup)

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
        items: orderItems,
        total_cents: totalCents,
        status: "pending",
        payment_method: "pix",
        customer_email: customerEmail,
        customer_name: payerName,
        is_sandbox: isSandboxGateway(),
        metadata: { user_id: user.id },
        affiliate_id: affiliateAttribution?.affiliateId ?? null,
        affiliate_code: affiliateAttribution?.affiliateCode ?? null,
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

    await confirmReservations(db, reservationGroup)

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
    if (decrementedLines.length > 0) {
      await revertDecrements(db, decrementedLines, reservationGroup)
    }
    const { body, status } = dbErrorResponse(
      err,
      "Não foi possível finalizar a compra. Tente novamente."
    )
    return NextResponse.json(body, { status })
  }
}
