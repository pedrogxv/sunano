import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { addItemToWishlist, removeItemFromWishlist } from "@/lib/server/repositories/wishlists-repository"

const bodySchema = z.object({ productId: z.string().uuid() })

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const { id } = await context.params
  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 })
  }

  try {
    await addItemToWishlist(id, user.id, parsed.data.productId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao adicionar item." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const { id } = await context.params
  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 })
  }

  try {
    await removeItemFromWishlist(id, user.id, parsed.data.productId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao remover item." },
      { status: 500 }
    )
  }
}
