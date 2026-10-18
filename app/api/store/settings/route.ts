import { NextResponse } from "next/server"
import { getStoreSettings } from "@/lib/server/repositories/store-settings-repository"
import { storeCardMaxInstallments, storeCardPaymentsEnabled } from "@/lib/server/payments/gateway"

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
    // Parcelas que o gateway de CARTÃO de fato oferece (ver
    // `storeCardMaxInstallments`). O valor salvo no admin continua valendo
    // para a Asaas e o Mercado Pago.
    cardMaxInstallments: storeCardMaxInstallments(settings.cardMaxInstallments),
    // Cartão desligado (`STORE_PAYMENT_METHODS`, Stripe implícito ou config inválida): as telas escondem preço e parcelas no
    // cartão, e o checkout só oferece PIX. Ver `storeCardPaymentsEnabled`.
    cardEnabled: storeCardPaymentsEnabled(),
  })
}
