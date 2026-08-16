import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { replaceProductVariants } from "@/lib/server/repositories/store-repository"

const MAX_STOCK = 999_999

const variantsSchema = z.object({
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(1).max(120),
        price_cents_override: z.number().int().positive().nullable().optional(),
        stock: z.number().int().min(0).max(MAX_STOCK),
      })
    )
    .max(50),
})

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = variantsSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    await replaceProductVariants(
      id,
      parsed.data.variants.map((v) => ({ ...v, price_cents_override: v.price_cents_override ?? null }))
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar variantes."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
