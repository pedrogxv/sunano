import { NextResponse } from "next/server"
import { getStoreSettings } from "@/lib/server/repositories/store-settings-repository"

export const runtime = "nodejs"

/**
 * Endpoint público (sem auth) — mesmo nível de sensibilidade que preço de
 * produto. É como os componentes de cliente (ProductCard, CartDrawer, tela
 * de checkout) descobrem o percentual de acréscimo do cartão sem importar
 * `lib/server/*`.
 */
export async function GET() {
  const settings = await getStoreSettings()
  return NextResponse.json({
    cardSurchargePercent: settings.cardSurchargePercent,
    cardMaxInstallments: settings.cardMaxInstallments,
  })
}
