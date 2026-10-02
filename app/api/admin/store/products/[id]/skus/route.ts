import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { ProductSkuConflictError, replaceProductSkus } from "@/lib/server/repositories/store-repository"
import { productSkusSchema } from "@/lib/server/validation/store-product-page"

/**
 * Salva a matriz de combinações (SKU) do produto. Chamada pelo formulário
 * DEPOIS de salvar cores e grupos, já com os ids reais deles.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const parsed = productSkusSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    await replaceProductSkus(id, parsed.data.skus)
  } catch (err) {
    if (err instanceof ProductSkuConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : "Erro ao salvar combinações."
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
