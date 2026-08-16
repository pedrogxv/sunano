import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  deleteWishlist,
  listWishlistItems,
  renameWishlist,
  setWishlistVisibility,
} from "@/lib/server/repositories/wishlists-repository"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const { id } = await context.params
  const items = await listWishlistItems(id, user.id)
  return NextResponse.json({ items })
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isPublic: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const { id } = await context.params
  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    if (parsed.data.name !== undefined) {
      await renameWishlist(id, user.id, parsed.data.name)
    }
    let shareToken: string | null = null
    if (parsed.data.isPublic !== undefined) {
      const result = await setWishlistVisibility(id, user.id, parsed.data.isPublic)
      shareToken = result.share_token
    }
    return NextResponse.json({ ok: true, share_token: shareToken })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar lista." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 })

  const { id } = await context.params
  try {
    await deleteWishlist(id, user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao deletar lista." }, { status: 500 })
  }
}
