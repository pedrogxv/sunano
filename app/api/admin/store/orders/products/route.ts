import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { searchOrderProducts } from "@/lib/server/repositories/orders-repository"
import { listSwapProductVariants } from "@/lib/server/repositories/order-item-swap-repository"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get("q") ?? ""

  // `?variantsOf=<id>`: as cores do produto (trocar o item de um pedido).
  const variantsOf = url.searchParams.get("variantsOf")
  if (variantsOf !== null) {
    if (!UUID_RE.test(variantsOf)) return NextResponse.json({ error: "Produto inválido." }, { status: 400 })
    return NextResponse.json({ ok: true, variants: await listSwapProductVariants(variantsOf) })
  }

  const products = await searchOrderProducts(q)
  return NextResponse.json({ ok: true, products })
}
