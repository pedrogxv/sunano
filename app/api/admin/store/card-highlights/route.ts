import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getCardHighlightVocabulary } from "@/lib/server/repositories/store-card-highlights-repository"

/** Vocabulário do seletor "Características no card" do formulário de produto. */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const rawId = request.nextUrl.searchParams.get("product_id")
  const productId = rawId && z.uuid().safeParse(rawId).success ? rawId : null

  try {
    return NextResponse.json(await getCardHighlightVocabulary(productId))
  } catch (error) {
    console.error("[api/admin/store/card-highlights] GET:", error)
    return NextResponse.json({ error: "Não foi possível carregar as características." }, { status: 500 })
  }
}
