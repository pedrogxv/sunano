import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { getStripe } from "@/lib/server/integrations/stripe"
import {
  insertMarketListing,
  listActiveMarketListings,
  listMyMarketListings,
  quoteMarketListingFee,
} from "@/lib/server/repositories/market-repository"
import { dbErrorResponse } from "@/lib/db-errors"

/**
 * Endpoint de anúncios do Mercado. Toda a lógica de banco/regra de taxa vive
 * em `market-repository.ts`/`lib/market-fees.ts`; esta rota só autentica,
 * valida a entrada e — quando há taxa a cobrar — abre o checkout do Stripe.
 */

const OLX_HOST_RE = /(^|\.)olx\.com\.br$/i

const listingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).optional(),
  price_cents: z.number().int().positive().max(500_000_00),
  olx_url: z
    .string()
    .url()
    .refine((url) => OLX_HOST_RE.test(new URL(url).hostname), {
      message: "O link precisa ser de um anúncio na OLX (olx.com.br).",
    }),
  images: z.array(z.string().url()).max(8).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)

    if (url.searchParams.get("mine") === "1") {
      const user = await getRequestUser(request)
      if (!user) {
        return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
      }
      const listings = await listMyMarketListings(user.id)
      return NextResponse.json({ ok: true, listings })
    }

    const listings = await listActiveMarketListings()
    return NextResponse.json({ ok: true, listings })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar anúncios do Mercado." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para anunciar." }, { status: 401 })
    }

    const parsed = listingSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "market_listing_create",
      identifier: user.id,
      maxAttempts: 5,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você criou muitos anúncios recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const quote = await quoteMarketListingFee(user.id, parsed.data.price_cents)
    if (!quote.ok) {
      return NextResponse.json({ error: quote.error }, { status: quote.status })
    }

    if (quote.feeCents === 0) {
      const result = await insertMarketListing({
        sellerId: user.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priceCents: parsed.data.price_cents,
        olxUrl: parsed.data.olx_url,
        images: parsed.data.images ?? [],
        feeCents: 0,
        isFreeVipSlot: quote.isFreeVipSlot,
        stripeSessionId: null,
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json({ ok: true, listingId: result.listingId, requiresPayment: false })
    }

    // Taxa > 0: abre o checkout ANTES de gravar o anúncio, para que a linha
    // nasça sempre com `stripe_session_id` preenchido — nunca existe um
    // anúncio "pendente" sem sessão associada.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: { name: `Taxa de publicação — ${parsed.data.title}` },
            unit_amount: quote.feeCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${appUrl}/mercado/meus-anuncios?checkout=success`,
      cancel_url: `${appUrl}/mercado/novo?checkout=cancel`,
      locale: "pt-BR",
      metadata: { kind: "market_fee" },
    })

    const result = await insertMarketListing({
      sellerId: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priceCents: parsed.data.price_cents,
      olxUrl: parsed.data.olx_url,
      images: parsed.data.images ?? [],
      feeCents: quote.feeCents,
      isFreeVipSlot: false,
      stripeSessionId: session.id,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, listingId: result.listingId, requiresPayment: true, checkoutUrl: session.url })
  } catch (err) {
    console.error("Market listing creation error:", err)
    const { body, status } = dbErrorResponse(err, "Não foi possível criar o anúncio. Tente novamente.")
    return NextResponse.json(body, { status })
  }
}
