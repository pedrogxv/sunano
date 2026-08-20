import { NextRequest, NextResponse } from "next/server"

import { getStoreProductDetail } from "@/lib/server/repositories/store-repository"

export const dynamic = "force-dynamic"

/**
 * Endpoint público de detalhe de um produto da Loja.
 *
 * A página `loja/[slug]` consome este endpoint em vez de abrir um cliente
 * Supabase no navegador.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  try {
    const detail = await getStoreProductDetail(slug)
    if (!detail) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ ok: true, ...detail })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar produto." }, { status: 500 })
  }
}
