import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  addFavorite,
  listFavoriteProductIds,
  listFavoriteProducts,
  removeFavorite,
} from "@/lib/server/repositories/store-favorites-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  productId: z.uuid("Produto inválido."),
  favorite: z.boolean(),
})

/**
 * GET /api/store/favorites: ids favoritados por quem está logado (pinta os
 * corações dos cards). Com `?products=1`, também os cards, para a página
 * /loja/favoritos. Deslogado recebe lista vazia (200), não 401: os cards só
 * usam isto para decidir a cor do coração.
 */
export async function GET(request: NextRequest) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ authenticated: false, productIds: [], items: [] })

  try {
    if (request.nextUrl.searchParams.get("products") === "1") {
      const items = await listFavoriteProducts(user.id)
      return NextResponse.json({ authenticated: true, productIds: items.map((item) => item.id), items })
    }
    const productIds = await listFavoriteProductIds(user.id)
    return NextResponse.json({ authenticated: true, productIds })
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar seus favoritos." }, { status: 500 })
  }
}

/** POST /api/store/favorites: `{ productId, favorite }` favorita ou desfavorita. */
export async function POST(request: NextRequest) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta para salvar favoritos." }, { status: 401 })

  const rateLimit = await checkRateLimit({
    action: "store_favorite",
    identifier: `user:${user.id}`,
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de tentar novamente." }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const { productId, favorite } = parsed.data
  const result = favorite ? await addFavorite(user.id, productId) : await removeFavorite(user.id, productId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true, favorite })
}
