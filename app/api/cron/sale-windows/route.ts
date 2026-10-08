import { NextRequest, NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

// Fecha o prazo das pré-vendas e lançamentos (migration 20261220000000): muda
// o preço conforme o admin escolheu e devolve o produto ao catálogo comum. A
// regra inteira mora na função SQL; aqui só se dispara. Mesmo padrão de
// /api/cron/vip-expiration (Bearer CRON_SECRET, fail closed).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await createSupabaseAdminClient().rpc("close_store_sale_windows")
  if (error) {
    console.error("[cron/sale-windows]", error)
    return NextResponse.json({ error: "Falha ao fechar os prazos de pré-venda e lançamento." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...data })
}
