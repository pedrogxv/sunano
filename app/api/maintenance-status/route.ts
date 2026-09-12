import { NextResponse } from "next/server"

import { isMaintenanceEnabled } from "@/lib/maintenance"

/**
 * Sonda de status do modo de manutenção.
 *
 * A tela `/maintenance` chama isto no botão "Tentar novamente" para saber se o
 * site voltou sem precisar recarregar a página às cegas (um reload durante a
 * manutenção só devolve a mesma tela e ainda joga fora a partida do mini-jogo).
 *
 * Rota liberada explicitamente no `proxy.ts` (MAINTENANCE_STATUS_PATH): o gate
 * de manutenção responde 503 para todo `/api/*`, então sem a exceção esta
 * própria sonda cairia junto e nunca conseguiria sinalizar a volta do site.
 *
 * `force-dynamic` + `no-store` porque a resposta depende de uma env que muda
 * no meio da janela: qualquer cache aqui faria o botão continuar dizendo "ainda
 * em manutenção" depois do site já ter voltado.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const maintenance = isMaintenanceEnabled()

  return NextResponse.json(
    { maintenance },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
