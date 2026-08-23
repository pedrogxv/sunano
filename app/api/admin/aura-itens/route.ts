import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createAuraItem, listAuraItemsForAdmin } from "@/lib/server/repositories/aura-store-repository"

const createAuraItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  frameAssetUrl: z.string().url(),
  auraCost: z.number().int().positive(),
  sortOrder: z.number().int().optional().default(0),
})

export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const items = await listAuraItemsForAdmin()
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = createAuraItemSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const item = await createAuraItem({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      frameAssetUrl: parsed.data.frameAssetUrl,
      auraCost: parsed.data.auraCost,
      sortOrder: parsed.data.sortOrder,
    })
    return NextResponse.json({ item })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar item de Aura."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
