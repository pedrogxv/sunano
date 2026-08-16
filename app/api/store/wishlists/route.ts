import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { createWishlist, listUserWishlists } from "@/lib/server/repositories/wishlists-repository"

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const wishlists = await listUserWishlists(user.id)
  return NextResponse.json({ wishlists })
}

const createSchema = z.object({ name: z.string().trim().min(1).max(80) })

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nome inválido." }, { status: 400 })
  }

  try {
    const wishlist = await createWishlist(user.id, parsed.data.name)
    return NextResponse.json({ wishlist })
  } catch {
    return NextResponse.json({ error: "Erro ao criar lista." }, { status: 500 })
  }
}
