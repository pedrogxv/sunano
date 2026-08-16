import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { isProductWishlisted, toggleDefaultWishlistItem } from "@/lib/server/repositories/wishlists-repository"

const bodySchema = z.object({ productId: z.string().uuid() })

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ wishlisted: false })

  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")
  if (!productId) return NextResponse.json({ error: "productId obrigatório." }, { status: 400 })

  const wishlisted = await isProductWishlisted(user.id, productId)
  return NextResponse.json({ wishlisted })
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta para salvar na lista de compras." }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 })
  }

  try {
    const result = await toggleDefaultWishlistItem(user.id, parsed.data.productId)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar lista de compras." }, { status: 500 })
  }
}
