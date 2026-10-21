import "server-only"

import { NextResponse } from "next/server"
import { checkBotId } from "botid/server"

/**
 * Conferência do Vercel BotID (modo Basic) nas rotas de compra.
 *
 * `STORE_BOTID_MODE`:
 * - `log` (padrão): só registra quem o BotID classifica como bot. É o modo de
 *   estreia: se o script de desafio não rodar no navegador (CSP, bloqueador),
 *   o BotID marcaria TODA compra como bot, e bloquear às cegas pararia a loja.
 *   Confira no log de um deploy de preview que compras reais saem `isHuman`
 *   antes de trocar para `enforce`.
 * - `enforce`: recusa com 403.
 * - `off`: nem consulta.
 *
 * Falha do próprio BotID deixa passar: os limites por conta, por IP e por CPF
 * continuam valendo, e derrubar o checkout por um serviço auxiliar fora do ar
 * seria pior que um bot a mais na fila.
 */
type BotIdMode = "off" | "log" | "enforce"

function botIdMode(): BotIdMode {
  const value = process.env.STORE_BOTID_MODE
  return value === "off" || value === "enforce" ? value : "log"
}

export async function rejectIfBot(route: string): Promise<NextResponse | null> {
  const mode = botIdMode()
  if (mode === "off") return null

  try {
    const verification = await checkBotId({ advancedOptions: { checkLevel: "basic" } })
    if (!verification.isBot) return null

    console.warn(`[bot-check] ${route}: classificado como bot (modo ${mode}).`)
    if (mode !== "enforce") return null
    return NextResponse.json(
      { error: "Não foi possível confirmar seu acesso. Recarregue a página e tente de novo." },
      { status: 403 }
    )
  } catch (err) {
    console.error(`[bot-check] ${route}: BotID indisponível, seguindo sem a conferência:`, err)
    return null
  }
}
