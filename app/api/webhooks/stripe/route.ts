import { NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import Stripe from "stripe"

export const runtime = "nodejs"

// Disable body parsing so we can verify the Stripe signature
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const db = createSupabaseAdminClient()

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session, db)
        break
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session
        await db
          .from("store_orders")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending")
        break
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge
        const pi = charge.payment_intent as string | null
        if (pi) {
          await db
            .from("store_orders")
            .update({ status: "refunded", updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", pi)
        }
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error("Webhook handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
) {
  const cartJson = session.metadata?.cart
  if (!cartJson) return

  const cart: Array<{ productId: string; quantity: number }> = JSON.parse(cartJson)

  // Update order to paid
  await db
    .from("store_orders")
    .update({
      status: "paid",
      stripe_payment_intent_id: session.payment_intent ?? null,
      customer_email: session.customer_details?.email ?? null,
      customer_name: session.customer_details?.name ?? null,
      payment_method: session.payment_method_types?.[0] ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_session_id", session.id)

  // Decrement stock for each purchased item
  for (const item of cart) {
    // Use a transaction-safe RPC or a select-then-update pattern.
    // PostgreSQL UPDATE with WHERE guard ensures we don't go below 0.
    await db.rpc("decrement_store_stock", {
      p_product_id: item.productId,
      p_quantity: item.quantity,
    })
  }
}
