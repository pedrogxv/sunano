import { NextResponse } from "next/server"

import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"

// Era `revalidate = 300` (uma cópia cacheada para todo mundo). Com a Loja em
// manutenção a resposta depende de QUEM pede (`store_access` fura), e uma
// cópia compartilhada serviria para o anônimo o catálogo montado para quem
// tem acesso, ou o 503 para quem tem.
export const dynamic = "force-dynamic"

/**
 * Opções de filtro pré-computadas (categorias, marcas, faixa de preço,
 * contagem por tipo) da Loja.
 */
export async function GET() {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const options = await getStoreFilterOptions("store")
  return NextResponse.json(options)
}
