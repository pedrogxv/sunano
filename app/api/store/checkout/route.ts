import { NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

interface CheckoutItem {
  productId: string
  quantity: number
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { items: CheckoutItem[] }
    const { items } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Carrinho vazio" }, { status: 400 })
    }

    const db = createSupabaseAdminClient()

    // Fetch products and validate stock
    const productIds = items.map((i) => i.productId)
    const { data: products, error: dbError } = await db
      .from("store_products")
      .select("id, name, price_cents, stock, images, type, condition, is_active")
      .in("id", productIds)

    if (dbError) throw dbError

    if (!products || products.length !== productIds.length) {
      return NextResponse.json({ error: "Um ou mais produtos não encontrados" }, { status: 404 })
    }

    // Validate each item
    const lineItems = []
    for (const cartItem of items) {
      const product = products.find((p) => p.id === cartItem.productId)

      if (!product) {
        return NextResponse.json({ error: `Produto não encontrado: ${cartItem.productId}` }, { status: 404 })
      }
      if (!product.is_active) {
        return NextResponse.json({ error: `Produto indisponível: ${product.name}` }, { status: 400 })
      }
      if (product.stock < cartItem.quantity) {
        return NextResponse.json(
          {
            error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}`,
          },
          { status: 400 }
        )
      }

      const description =
        product.type === "bazaar" && product.condition !== "new"
          ? `Produto usado/já aberto — ${product.condition === "opened" ? "embalagem aberta" : "usado pelo Sunano"}`
          : undefined

      lineItems.push({
        price_data: {
          currency: "brl",
          product_data: {
            name: product.name,
            images:
              product.images && product.images.length > 0
                ? [product.images[0]]
                : [],
            ...(description ? { description } : {}),
          },
          unit_amount: product.price_cents,
        },
        quantity: cartItem.quantity,
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      // payment_method_types: ["card", "pix"],
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      locale: "pt-BR",
      metadata: {
        cart: JSON.stringify(items),
      },
      payment_intent_data: {
        metadata: {
          cart: JSON.stringify(items),
        },
      },
    })

    // Create a pending order record
    const orderItems = items.map((cartItem) => {
      const p = products.find((pr) => pr.id === cartItem.productId)!
      return {
        id: p.id,
        name: p.name,
        price_cents: p.price_cents,
        quantity: cartItem.quantity,
      }
    })

    await db.from("store_orders").insert({
      stripe_session_id: session.id,
      items: orderItems,
      total_cents: orderItems.reduce((s, i) => s + i.price_cents * i.quantity, 0),
      status: "pending",
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("Checkout error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    )
  }
}
