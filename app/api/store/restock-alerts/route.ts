import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getRestockAlertState,
  subscribeRestockAlert,
  unsubscribeRestockAlert,
} from "@/lib/server/repositories/store-restock-repository"

/**
 * "Avise-me quando voltar" de um produto esgotado da Loja. Exige login: o
 * aviso é entregue pelo sino de notificações do site, que só existe para
 * usuário autenticado.
 */

const bodySchema = z.object({
  productId: z.string().uuid(),
  /** null = qualquer cor. */
  variantId: z.string().uuid().nullable().optional().default(null),
  subscribe: z.boolean(),
})

/** Estado atual das inscrições do usuário nesse produto. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ product: false, variantIds: [] })

  const productId = request.nextUrl.searchParams.get("productId")
  if (!productId) return NextResponse.json({ error: "productId é obrigatório." }, { status: 400 })

  const state = await getRestockAlertState(user.id, productId)
  return NextResponse.json(state)
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Faça login para ativar o aviso." }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const { productId, variantId, subscribe } = parsed.data

  try {
    if (subscribe) {
      await subscribeRestockAlert({ userId: user.id, productId, variantId: variantId ?? null })
    } else {
      await unsubscribeRestockAlert({ userId: user.id, productId, variantId: variantId ?? null })
    }
    return NextResponse.json({ ok: true, subscribed: subscribe })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar o aviso."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
