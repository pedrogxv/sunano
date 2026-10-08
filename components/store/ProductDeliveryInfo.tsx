"use client"

import { CalendarClock } from "lucide-react"

import { useDeliveryEstimate } from "@/lib/hooks/use-delivery-estimate"
import { STORE_DELIVERY_BUSINESS_DAYS } from "@/lib/store-shipping"

interface ProductDeliveryInfoProps {
  preOrder: boolean
}

/**
 * Previsão de entrega, logo abaixo do botão de compra. Só para produto que vai
 * pelo correio e que dá para comprar agora: quem chama confere os dois. O
 * "Frete grátis" fica na grade de benefícios (`ProductPurchaseBenefits`),
 * ao lado; repetido aqui, a mesma frase aparecia duas vezes em sequência.
 *
 * A data ("Receba até sex., 23 de out.") só aparece depois de montar no
 * navegador (ver `useDeliveryEstimate`); até lá, o prazo em dias úteis.
 */
export function ProductDeliveryInfo({ preOrder }: ProductDeliveryInfoProps) {
  const deadline = useDeliveryEstimate()
  const days = STORE_DELIVERY_BUSINESS_DAYS

  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border px-5 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/40">
        <CalendarClock className="size-5 text-foreground/80" />
      </span>
      {preOrder ? (
        <div>
          <p className="text-[15px] font-semibold text-foreground">Envios a partir do dia de Lançamento</p>
          <p className="text-[13px] text-muted-foreground">A partir do lançamento, a entrega leva até {days} dias úteis.</p>
        </div>
      ) : (
        <div>
          <p className="text-[15px] font-semibold text-foreground">
            {deadline ? (
              <>
                Receba até <span className="text-emerald-400">{deadline}</span>
              </>
            ) : (
              `Receba em até ${days} dias úteis`
            )}
          </p>
          <p className="text-[13px] text-muted-foreground">Até {days} dias úteis, contados da confirmação do pagamento.</p>
        </div>
      )}
    </div>
  )
}
