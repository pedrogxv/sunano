import { NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuraPurchaseSummaryByItem } from "@/lib/server/repositories/aura-store-repository"

/**
 * Resumo agregado (nº de compras + Aura gasta) por item, para os badges da
 * tabela de Itens de Aura. Mesma permissão que gerencia o catálogo
 * (`events_read` — Web Master sempre passa pela matriz de cargos).
 */
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const summary = await getAuraPurchaseSummaryByItem()
  return NextResponse.json({ summary })
}
