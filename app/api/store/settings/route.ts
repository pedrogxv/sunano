import { NextResponse } from "next/server"
import { getStoreSettings } from "@/lib/server/repositories/store-settings-repository"
import { activePaymentGateway, storeCardPaymentsEnabled } from "@/lib/server/payments/gateway"

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
    // Parcelas que o gateway ATIVO de fato oferece. O Stripe Brasil não
    // parcela (o cartão é à vista), e as vitrines diziam "em até 6x sem
    // juros" para uma compra que não teria parcela nenhuma. O valor salvo no
    // admin continua valendo quando a loja volta para a Asaas.
    cardMaxInstallments: activePaymentGateway() === "stripe" ? 1 : settings.cardMaxInstallments,
    // Cartão desligado (Stripe: só PIX): as telas escondem preço e parcelas no
    // cartão, e o checkout só oferece PIX. Ver `storeCardPaymentsEnabled`.
    cardEnabled: storeCardPaymentsEnabled(),
  })
}
