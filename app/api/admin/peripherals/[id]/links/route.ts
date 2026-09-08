import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  listAdminProductsByPeripheral,
  replacePeripheralProducts,
} from "@/lib/server/repositories/store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const linksPayload = z.object({
  // `storeProductIds` é a forma atual (vários anúncios por periférico:
  // venda normal, pronta entrega, pré-venda). `storeProductId` continua aceito
  // para não quebrar chamadas antigas de um vínculo só.
  storeProductIds: z.array(z.string().uuid()).max(20).optional(),
  storeProductId: z.string().uuid().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_read")) {
    return NextResponse.json({ error: "Sem permissão para ler periféricos." }, { status: 403 })
  }

  const { id } = await params
  const products = await listAdminProductsByPeripheral(id)

  // `store` (singular) mantém o formato antigo da resposta para consumidores
  // que só esperavam um produto.
  return NextResponse.json({ products, store: products[0] ?? null })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão para vincular produtos a periféricos." }, { status: 403 })
  }

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)." }, { status: 400 })
  }

  const parsed = linksPayload.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const requested = parsed.data.storeProductIds ?? (parsed.data.storeProductId ? [parsed.data.storeProductId] : [])
  // Preserva a ordem escolhida no admin, sem repetir o mesmo produto.
  const productIds = [...new Set(requested)]

  const db = createSupabaseAdminClient()

  if (productIds.length > 0) {
    const { data: products, error: lookupError } = await db
      .from("store_products")
      .select("id, type")
      .in("id", productIds)
    if (lookupError) {
      const { body, status } = dbErrorResponse(lookupError, "Erro ao buscar produtos.")
      return NextResponse.json(body, { status })
    }

    const found = (products ?? []) as Array<{ id: string; type: string }>
    if (found.length !== productIds.length) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 })
    }
    if (found.some((p) => p.type !== "store")) {
      return NextResponse.json({ error: "Os produtos selecionados precisam ser do tipo Loja." }, { status: 400 })
    }
  }

  try {
    await replacePeripheralProducts(id, productIds)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar vínculo."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // A coluna legada `store_products.peripheral_id` continua existindo e é lida
  // pela tela de edição do produto na Loja — mantém em sincronia com a tabela
  // de vínculo para as duas telas mostrarem a mesma coisa.
  const { error: clearError } = await (db.from("store_products") as any)
    .update({ peripheral_id: null })
    .eq("peripheral_id", id)
    .eq("type", "store")
  if (clearError) {
    const { body, status } = dbErrorResponse(clearError, "Erro ao limpar vínculo anterior.")
    return NextResponse.json(body, { status })
  }

  if (productIds.length > 0) {
    const { error: setError } = await (db.from("store_products") as any)
      .update({ peripheral_id: id })
      .in("id", productIds)
    if (setError) {
      const { body, status } = dbErrorResponse(setError, "Erro ao salvar vínculo.")
      return NextResponse.json(body, { status })
    }
  }

  return NextResponse.json({ ok: true })
}
