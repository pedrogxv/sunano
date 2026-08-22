import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { createPixTransaction } from "@/lib/server/integrations/misticpay"
import { findOrCreateCustomer, createPixPayment, getPixQrCode } from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { payerInfoSchema } from "@/lib/server/validation/guest-checkout"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { dbErrorResponse } from "@/lib/db-errors"
import {
  getVariantsForCheckout,
  getVariantOptionsForCheckout,
  getRecentProductPurchaseQuantity,
  getSoldOutCombinations,
  DAILY_PURCHASE_LIMIT_NO_STOCK,
} from "@/lib/server/repositories/store-repository"
import { PIX_EXPIRATION_MINUTES } from "@/lib/server/repositories/orders-repository"
import { getAffiliateByCode } from "@/lib/server/repositories/affiliates-repository"
import { isWebMaster } from "@/lib/admin-permissions"
import type { Database } from "@/lib/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 20

type DecrementedLine = { productId: string; variantId: string | null; quantity: number }

const MAX_ITEM_LINES = 50
const MAX_QUANTITY_PER_LINE = 20

const AFFILIATE_REF_COOKIE = "sn_aff_ref"
const AFFILIATE_REF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const checkoutItemSchema = z.object({
  productId: z.string("Quantidade inválida no carrinho.").min(1, "Quantidade inválida no carrinho."),
  variantId: z.string().min(1, "Quantidade inválida no carrinho.").nullish(),
  variantOptionIds: z.array(z.string().min(1, "Quantidade inválida no carrinho.")).nullish(),
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

  if (typeof parsed.code !== "string" || typeof parsed.clickedAt !== "number") return null
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
async function revertDecrements(db: SupabaseClient<Database>, lines: DecrementedLine[]) {
  await Promise.all(
    lines.map(async (line) => {
      try {
        if (line.variantId) {
          await db.rpc("increment_variant_stock", { p_variant_id: line.variantId, p_quantity: line.quantity })
        } else {
          await db.rpc("increment_store_stock", { p_product_id: line.productId, p_quantity: line.quantity })
        }
      } catch (err) {
        console.error("[checkout] falha ao reverter reserva de estoque:", line, err)
      }
    })
  )
}

export async function POST(request: NextRequest) {
  // Declarado fora do try para o catch externo conseguir reverter reservas
  // de estoque já aplicadas mesmo se uma exceção (ex. chamada ao gateway)
  // interromper o fluxo antes do insert do pedido.
  const decrementedLines: DecrementedLine[] = []
  const db = createSupabaseAdminClient()

  // Segunda checagem da mesma flag que o proxy já aplica (proxy.ts) — fechado
  // por padrão, caso o matcher/lógica do proxy mude e essa rota deixe de
  // passar por lá. WEB MASTER ignora a manutenção, igual no proxy.
  const storeMaintenance = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  if (storeMaintenance === "true") {
    const maintenanceUser = await getRequestUser(request)
    const { data: maintenanceProfile } = maintenanceUser
      ? await db.from("admin_profiles").select("id, role, permissions").eq("id", maintenanceUser.id).maybeSingle()
      : { data: null }

    if (!isWebMaster(maintenanceProfile)) {
      return NextResponse.json(
        { error: "A Loja está temporariamente indisponível para novos pedidos." },
        { status: 503 }
      )
    }
  }

  try {
    // Toda requisição de compra é limitada por IP para impedir spam de
    // transações PIX na MisticPay (cada uma gera QR code e custa uma
    // tentativa na conta), antes mesmo de checar autenticação.
    const clientId = getClientIdentifier(request)
    const rateLimit = await checkRateLimit({
      action: "store_checkout_create",
      identifier: clientId,
      maxAttempts: 10,
      windowSeconds: 600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas de compra. Aguarde alguns minutos e tente novamente." },
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
    const affiliateAttribution = await resolveAffiliateAttribution(request, user.id)

    const rawBody = await request.json().catch(() => null)
    const parsedBody = checkoutBodySchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? "Carrinho inválido." },
        { status: 400 }
      )
    }
    const { items } = parsedBody.data

    // Agrupa por (produto, variante, opções de variante) antes de checar
    // estoque — sem isso, repetir o mesmo par em várias entradas do carrinho
    // passava pela checagem de estoque por linha mesmo pedindo, no total,
    // mais unidades do que existem. Combinações diferentes do mesmo produto
    // NÃO são mescladas — cada uma tem seu próprio estoque/preço.
    const lineKey = (productId: string, variantId: string | null, optionIds: string[]) =>
      `${productId}:${variantId ?? ""}:${[...optionIds].sort().join(",")}`
    const quantityByLine = new Map<
      string,
      { productId: string; variantId: string | null; optionIds: string[]; quantity: number }
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

    if ([...quantityByLine.values()].some((line) => line.quantity > MAX_QUANTITY_PER_LINE)) {
      return NextResponse.json({ error: "Quantidade por produto excede o limite permitido." }, { status: 400 })
    }

    // Preço e estoque SEMPRE vêm do banco — o corpo da requisição só informa
    // productId/variantId/quantity. O cliente nunca envia (nem influencia)
    // price_cents: isso fecha a brecha de manipular o valor cobrado pelo carrinho.
    const mergedItems = [...quantityByLine.values()]
    const productIds = [...new Set(mergedItems.map((line) => line.productId))]
    const variantIds = [...new Set(mergedItems.map((line) => line.variantId).filter((id): id is string => id != null))]
    const optionIds = [...new Set(mergedItems.flatMap((line) => line.optionIds))]

    const [{ data: products, error: dbError }, variants, variantOptions, soldOutCombinations] = await Promise.all([
      db
        .from("store_products")
        .select("id, name, price_cents, stock, images, type, condition, is_active, is_sold_out")
        .in("id", productIds),
      getVariantsForCheckout(variantIds),
      getVariantOptionsForCheckout(optionIds),
      getSoldOutCombinations(variantIds, optionIds),
    ])
    const soldOutCombinationKeys = new Set(
      soldOutCombinations.map((c) => `${c.variant_id}:${c.option_id}`)
    )

    if (dbError) {
      const { body, status } = dbErrorResponse(dbError, "Não foi possível carregar os produtos do carrinho.")
      return NextResponse.json(body, { status })
    }

    if (!products || products.length !== productIds.length) {
      return NextResponse.json({ error: "Um ou mais produtos não encontrados" }, { status: 404 })
    }

    if (variants.length !== variantIds.length) {
      return NextResponse.json({ error: "Uma ou mais variantes não encontradas" }, { status: 404 })
    }

    if (variantOptions.length !== optionIds.length) {
      return NextResponse.json({ error: "Uma ou mais variantes não encontradas" }, { status: 404 })
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
        return NextResponse.json({ error: `Produto não encontrado: ${cartItem.productId}` }, { status: 404 })
      }
      if (!product.is_active) {
        return NextResponse.json({ error: `Produto indisponível: ${product.name}` }, { status: 400 })
      }
      if (product.is_sold_out) {
        return NextResponse.json({ error: `Produto esgotado: ${product.name}` }, { status: 400 })
      }

      const variant = cartItem.variantId ? variants.find((v) => v.id === cartItem.variantId) : null
      if (cartItem.variantId) {
        if (!variant || variant.product_id !== product.id) {
          return NextResponse.json({ error: `Variante não encontrada para "${product.name}"` }, { status: 404 })
        }
        if (!variant.is_active || variant.is_sold_out) {
          return NextResponse.json({ error: `Variante indisponível: ${product.name} — ${variant.label}` }, { status: 400 })
        }
      }

      const options = cartItem.optionIds.map((id) => variantOptions.find((o) => o.id === id)).filter(
        (o): o is (typeof variantOptions)[number] => o != null
      )
      if (options.length !== cartItem.optionIds.length) {
        return NextResponse.json({ error: `Variante não encontrada para "${product.name}"` }, { status: 404 })
      }
      for (const option of options) {
        if (option.group.product_id !== product.id) {
          return NextResponse.json({ error: `Variante não encontrada para "${product.name}"` }, { status: 404 })
        }
        if (option.is_sold_out) {
          return NextResponse.json(
            { error: `Variante indisponível: ${product.name} — ${option.label}` },
            { status: 400 }
          )
        }
      }
      // Uma opção por grupo, no máximo.
      if (new Set(options.map((o) => o.group.id)).size !== options.length) {
        return NextResponse.json({ error: `Selecione só uma opção por grupo de variantes: "${product.name}"` }, { status: 400 })
      }

      // Combinação Cor × Variante esgotada — checado à parte dos flags
      // isolados acima, já que uma cor e uma opção podem estar disponíveis
      // individualmente mas bloqueadas juntas (ver store_product_variant_combinations).
      if (variant) {
        for (const option of options) {
          if (soldOutCombinationKeys.has(`${variant.id}:${option.id}`)) {
            return NextResponse.json(
              { error: `Combinação indisponível: ${product.name} — ${variant.label} + ${option.label}` },
              { status: 400 }
            )
          }
        }
      }

      validatedLines.push({
        product,
        variant: variant ?? null,
        options: [...options].sort((a, b) => a.group.position - b.group.position),
        quantity: cartItem.quantity,
      })
    }

    // Limite de 15un/produto/usuário a cada 24h — só para produtos SEM
    // controle de estoque (stock null), onde não há outro teto natural
    // fechando a compra (produto com estoque real já é limitado pelo
    // próprio estoque + o MAX_QUANTITY_PER_LINE acima). Sem essa política a
    // loja não tem como impedir alguém de "levar tudo" de um item digital/
    // sem estoque numa única conta. Agrega por produto (não por linha) —
    // duas variantes sem estoque do mesmo produto competem pelo mesmo teto.
    const unlimitedStockQuantityByProduct = new Map<string, number>()
    for (const line of validatedLines) {
      const effectiveStock = line.variant ? line.variant.stock : line.product.stock
      if (effectiveStock !== null) continue
      unlimitedStockQuantityByProduct.set(
        line.product.id,
        (unlimitedStockQuantityByProduct.get(line.product.id) ?? 0) + line.quantity
      )
    }
    if (unlimitedStockQuantityByProduct.size > 0) {
      const checks = await Promise.all(
        [...unlimitedStockQuantityByProduct.entries()].map(async ([productId, quantity]) => {
          const alreadyBought = await getRecentProductPurchaseQuantity(user.id, productId)
          return { productId, quantity, alreadyBought }
        })
      )
      const exceeded = checks.find(
        (c) => c.alreadyBought + c.quantity > DAILY_PURCHASE_LIMIT_NO_STOCK
      )
      if (exceeded) {
        const product = products.find((p) => p.id === exceeded.productId)
        const remaining = Math.max(0, DAILY_PURCHASE_LIMIT_NO_STOCK - exceeded.alreadyBought)
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
        if (variant) {
          const { data: decremented } = await db.rpc("decrement_variant_stock", {
            p_variant_id: variant.id,
            p_quantity: quantity,
          })
          return { line, ok: Boolean(decremented) }
        }
        const { data: decremented } = await db.rpc("decrement_store_stock", {
          p_product_id: product.id,
          p_quantity: quantity,
        })
        return { line, ok: Boolean(decremented) }
      })
    )

    for (const { line, ok } of decrementResults) {
      if (!ok) continue
      decrementedLines.push({
        productId: line.product.id,
        variantId: line.variant?.id ?? null,
        quantity: line.quantity,
      })
    }

    const failed = decrementResults.find((r) => !r.ok)
    if (failed) {
      await revertDecrements(db, decrementedLines)
      const { product, variant } = failed.line
      const label = variant ? `${product.name} — ${variant.label}` : product.name
      return NextResponse.json({ error: `Estoque insuficiente para "${label}".` }, { status: 409 })
    }

    let totalCents = 0
    const orderItems = []
    for (const line of validatedLines) {
      const { product, variant, options, quantity } = line
      // Overrides se acumulam nesta ordem, o último presente vence: preço
      // base → cor → cada opção de grupo selecionada, na ordem de
      // `group.position` — mesma regra usada em ProductDetailContent.
      let effectivePriceCents = variant?.price_cents_override ?? product.price_cents
      for (const option of options) {
        if (option.price_cents_override != null) effectivePriceCents = option.price_cents_override
      }

      totalCents += effectivePriceCents * quantity
      orderItems.push({
        id: product.id,
        name: product.name,
        price_cents: effectivePriceCents,
        quantity,
        variant_id: variant?.id ?? null,
        variant_label: variant?.label ?? null,
        variant_options: options.map((o) => ({ group: o.group.name, label: o.label })),
        image: product.images?.[0] ?? null,
      })
    }

    if (totalCents <= 0) {
      await revertDecrements(db, decrementedLines)
      return NextResponse.json({ error: "Valor do pedido inválido." }, { status: 400 })
    }

    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name, cpf, asaas_customer_id")
      .eq("id", user.id)
      .single()
    let payerName: string | null = profile?.full_name ?? null
    let payerDocument: string | null = profile?.cpf ?? null
    const customerEmail: string | null = user.email
    const cachedAsaasCustomerId: string | null = profile?.asaas_customer_id ?? null

    // Perfil sem nome/CPF: o próprio checkout aceita esses dados no corpo
    // da requisição (a tela mostra os campos quando o perfil está
    // incompleto) e completa o cadastro aqui — não existe uma tela separada
    // de "editar perfil" para isso hoje.
    if (!payerName || !payerDocument) {
      const payer = payerInfoSchema.safeParse(parsedBody.data)
      if (!payer.success) {
        await revertDecrements(db, decrementedLines)
        return NextResponse.json(
          { error: payer.error.issues[0]?.message ?? "Informe seu nome e CPF para finalizar a compra." },
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
        await revertDecrements(db, decrementedLines)
        const { body: errBody, status } = dbErrorResponse(
          profileUpdateError,
          "Não foi possível salvar seus dados. Tente novamente."
        )
        return NextResponse.json(errBody, { status })
      }
    }

    // Ambos os gateways exigem nome e CPF do pagador para emitir o PIX.
    if (!payerName || !payerDocument) {
      await revertDecrements(db, decrementedLines)
      return NextResponse.json(
        { error: "Informe seu nome e CPF para finalizar a compra." },
        { status: 400 }
      )
    }

    const description = `Pedido Sunano — ${orderItems.length} ${orderItems.length === 1 ? "item" : "itens"}`

    // MisticPay é o gateway padrão hoje — Asaas fica atrás de
    // PAYMENT_GATEWAY=asaas até a migração ser concluída.
    const gateway = process.env.PAYMENT_GATEWAY === "asaas" ? "asaas" : "misticpay"

    let orderInsert: Partial<Database["public"]["Tables"]["store_orders"]["Insert"]>
    let qrCodeBase64: string
    let copyPaste: string

    if (gateway === "asaas") {
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
        await db.from("user_profiles").update({ asaas_customer_id: customer.id }).eq("id", user.id)
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
        pix_expires_at: qrCode.expirationDate,
      }
    } else {
      // transactionId próprio (não o id do pedido) para não vazar UUID interno
      // do banco na integração externa, e para poder recriar o pedido antes
      // de saber o id gerado pelo insert.
      const transactionId = randomUUID()

      const pix = await createPixTransaction({
        amountCents: totalCents,
        transactionId,
        description,
        payerName,
        payerDocument,
      })

      qrCodeBase64 = pix.qrCodeBase64
      copyPaste = pix.copyPaste
      orderInsert = {
        misticpay_transaction_id: pix.transactionId,
        pix_copy_paste: copyPaste,
        pix_qr_code_base64: qrCodeBase64,
        // A API da MisticPay não retorna prazo de expiração do PIX (diferente
        // da Asaas, que devolve `expirationDate` real) — aplicamos a mesma
        // janela fixa usada pelo cron de expiração (`PIX_EXPIRATION_MINUTES`)
        // como fonte de verdade única em `pix_expires_at` para os dois gateways.
        pix_expires_at: new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000).toISOString(),
      }
    }

    const { data: order, error: insertError } = await db
      .from("store_orders")
      .insert({
        ...orderInsert,
        items: orderItems,
        total_cents: totalCents,
        status: "pending",
        payment_method: "pix",
        customer_email: customerEmail,
        customer_name: payerName,
        metadata: { user_id: user.id },
        affiliate_id: affiliateAttribution?.affiliateId ?? null,
        affiliate_code: affiliateAttribution?.affiliateCode ?? null,
      })
      .select("id")
      .single()

    if (insertError || !order) {
      await revertDecrements(db, decrementedLines)
      const { body, status } = dbErrorResponse(insertError, "Não foi possível registrar o pedido.")
      return NextResponse.json(body, { status })
    }

    return NextResponse.json({
      orderId: order.id,
      qrCodeBase64,
      copyPaste,
    })
  } catch (err) {
    console.error("Checkout error:", err)
    if (decrementedLines.length > 0) {
      await revertDecrements(db, decrementedLines)
    }
    const { body, status } = dbErrorResponse(err, "Não foi possível finalizar a compra. Tente novamente.")
    return NextResponse.json(body, { status })
  }
}
