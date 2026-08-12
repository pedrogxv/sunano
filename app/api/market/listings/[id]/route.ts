import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getMarketListingDetail,
  markOwnMarketListingSold,
  updateOwnMarketListing,
} from "@/lib/server/repositories/market-repository"

const OLX_HOST_RE = /(^|\.)olx\.com\.br$/i

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  price_cents: z.number().int().positive().max(500_000_00).optional(),
  olx_url: z
    .string()
    .url()
    .refine((url) => OLX_HOST_RE.test(new URL(url).hostname), {
      message: "O link precisa ser de um anúncio na OLX (olx.com.br).",
    })
    .optional(),
  images: z.array(z.string().url()).max(8).optional(),
  mark_sold: z.boolean().optional(),
})

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const user = await getRequestUser(request)
    const listing = await getMarketListingDetail(id, user?.id)
    if (!listing) {
      return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ ok: true, listing })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar anúncio." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  if (parsed.data.mark_sold) {
    const result = await markOwnMarketListingSold(id, user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  }

  const result = await updateOwnMarketListing({
    id,
    userId: user.id,
    patch: {
      title: parsed.data.title,
      description: parsed.data.description,
      priceCents: parsed.data.price_cents,
      olxUrl: parsed.data.olx_url,
      images: parsed.data.images,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
