"use client"

import { useSyncExternalStore } from "react"

import { deliveryDeadline, formatDeliveryDate, todayKeySaoPaulo } from "@/lib/store-shipping"

const subscribe = () => () => {}
const today = () => todayKeySaoPaulo()
const noDateOnServer = () => null

/**
 * Último dia da previsão de entrega para quem pagar hoje ("sex., 23 de out."),
 * ou `null` no servidor e na hidratação. As páginas da Loja são ISR: a data
 * calculada na geração ficaria velha no cache e divergiria da do navegador.
 * Enquanto não há data, a tela mostra o prazo em dias úteis, que não muda.
 */
export function useDeliveryEstimate(): string | null {
  const key = useSyncExternalStore(subscribe, today, noDateOnServer)
  return key ? formatDeliveryDate(deliveryDeadline(key)) : null
}
