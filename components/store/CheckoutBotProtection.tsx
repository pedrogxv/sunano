"use client"

import { useEffect } from "react"
import { initBotId } from "botid/client/core"
import { STORE_BOTID_ROUTES } from "@/lib/store-bot-protection"

// `initBotId` não se protege contra uma segunda chamada: cada uma embrulha o
// `fetch` de novo. Sair e voltar ao checkout remontaria o componente.
let initialized = false

/**
 * Liga o Vercel BotID nas chamadas de compra (ver `STORE_BOTID_ROUTES`).
 *
 * Montado só no layout de `/checkout`, não no site inteiro: o script de
 * desafio só faz falta onde a compra acontece, e carregá-lo em toda página
 * pesaria no PageSpeed. Por `useEffect` e não `<BotIdClient>`: aquele é um
 * <script> inline, que não roda quando se chega ao checkout por navegação no
 * cliente ("Comprar agora" usa `router.push`).
 */
export function CheckoutBotProtection() {
  useEffect(() => {
    if (initialized) return
    initialized = true
    initBotId({ protect: STORE_BOTID_ROUTES })
  }, [])
  return null
}
