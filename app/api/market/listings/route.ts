import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { findOrCreateCustomer, createPixPayment, getPixQrCode } from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { parsePayerInfo } from "@/lib/server/validation/guest-checkout"
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
 * valida a entrada e — quando há taxa a cobrar — abre uma cobrança PIX
 * (Asaas), mesmo padrão de `app/api/store/checkout/route.ts`.
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
    const page = Number(url.searchParams.get("page")) || 1
    const pageSize = Number(url.searchParams.get("pageSize")) || 24

    if (url.searchParams.get("mine") === "1") {
      const user = await getRequestUser(request)
      if (!user) {
        return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
      }
      const { listings, total, hasMore } = await listMyMarketListings(user.id, page, pageSize)
      return NextResponse.json({ ok: true, listings, total, hasMore })
    }

    const { listings, total, hasMore } = await listActiveMarketListings(page, pageSize)
    return NextResponse.json({ ok: true, listings, total, hasMore })
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

    const rawBody = await request.json().catch(() => null)
    const parsed = listingSchema.safeParse(rawBody)
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
        asaasPaymentId: null,
        asaasCustomerId: null,
        pixCopyPaste: null,
        pixQrCodeBase64: null,
        pixExpiresAt: null,
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json({ ok: true, listingId: result.listingId, requiresPayment: false })
    }

    // Taxa > 0: precisa de nome e CPF do vendedor para emitir o PIX no Asaas
    // — mesma exigência do checkout da loja. Reaproveita o perfil quando já
    // está completo; senão aceita vir no corpo da requisição e salva.
    const db = createSupabaseAdminClient()
    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name, cpf, asaas_customer_id")
      .eq("id", user.id)
      .single()

    let payerName = profile?.full_name ?? null
    let payerDocument = profile?.cpf ?? null
    const cachedAsaasCustomerId = profile?.asaas_customer_id ?? null

    if (!payerName || !payerDocument) {
      try {
        const payer = parsePayerInfo(rawBody)
        payerName = payer.name
        payerDocument = payer.document
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Informe seu nome e CPF para pagar a taxa." },
          { status: 400 }
        )
      }

      await db.from("user_profiles").update({ full_name: payerName, cpf: payerDocument }).eq("id", user.id)
    }

    // Abre a cobrança PIX ANTES de gravar o anúncio, para que a linha nasça
    // sempre com `asaas_payment_id` preenchido — nunca existe um anúncio
    // "pendente" sem cobrança associada.
    const customer = await findOrCreateCustomer({
      name: payerName,
      cpfCnpj: payerDocument,
      email: user.email,
    })

    if (customer.id !== cachedAsaasCustomerId) {
      await db.from("user_profiles").update({ asaas_customer_id: customer.id }).eq("id", user.id)
    }

    const payment = await createPixPayment({
      customerId: customer.id,
      amountCents: quote.feeCents,
      description: `Taxa de publicação — ${parsed.data.title}`,
      externalReference: randomUUID(),
    })

    const qrCode = await getPixQrCode(payment.id)

    const result = await insertMarketListing({
      sellerId: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priceCents: parsed.data.price_cents,
      olxUrl: parsed.data.olx_url,
      images: parsed.data.images ?? [],
      feeCents: quote.feeCents,
      isFreeVipSlot: false,
      asaasPaymentId: payment.id,
      asaasCustomerId: customer.id,
      pixCopyPaste: qrCode.payload,
      pixQrCodeBase64: qrCode.encodedImage,
      pixExpiresAt: qrCode.expirationDate,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, listingId: result.listingId, requiresPayment: true })
  } catch (err) {
    console.error("Market listing creation error:", err)
    const { body, status } = dbErrorResponse(err, "Não foi possível criar o anúncio. Tente novamente.")
    return NextResponse.json(body, { status })
  }
}
