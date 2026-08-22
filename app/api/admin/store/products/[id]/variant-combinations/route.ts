import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { replaceProductVariantCombinations } from "@/lib/server/repositories/store-repository"

const combinationsSchema = z.object({
  combinations: z.array(
    z.object({
      variant_id: z.string().uuid(),
      option_id: z.string().uuid(),
    })
  ),
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
  const parsed = combinationsSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    await replaceProductVariantCombinations(id, parsed.data.combinations)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar combinações."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
