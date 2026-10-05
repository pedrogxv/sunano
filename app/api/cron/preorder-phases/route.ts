import { NextRequest, NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

// Avança as pré-vendas com prazo (migration 20261215000000): fim do desconto
// inicial apaga a promoção, fim do prazo devolve o produto ao catálogo. A
// regra inteira mora na função SQL; aqui só se dispara. Mesmo padrão de
// /api/cron/vip-expiration (Bearer CRON_SECRET, fail closed).
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await createSupabaseAdminClient().rpc("advance_preorder_phases")
  if (error) {
    console.error("[cron/preorder-phases]", error)
    return NextResponse.json({ error: "Falha ao avançar as pré-vendas." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...data })
}
