import { NextRequest, NextResponse } from "next/server"

import { runTrustDailyJob } from "@/lib/server/repositories/trust-repository"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// A varredura recalcula conta por conta (contas dentro da janela de
// maturidade + contas com penalidade decaindo) e depois agrega o ledger de
// aura dos últimos 7 dias. 60s dá folga para a base crescer bastante antes de
// isto precisar virar processamento em lotes.
export const maxDuration = 60

/**
 * Rotina diária do Trust Factor (§7 do documento).
 *
 * POR QUE ELA EXISTE, SE O EVENTO JÁ RECALCULA NA HORA
 * ----------------------------------------------------
 * `apply_trust_event` recalcula a nota imediatamente — quem levou warning vê o
 * efeito no mesmo segundo. Esta rotina cobre o que muda SEM evento nenhum:
 *
 *   * RECUPERAÇÃO — a penalidade perde peso dia a dia (rampa linear após 30
 *     dias, conforme a severidade). Ninguém "faz" nada no dia em que uma
 *     infração leve termina de expirar.
 *   * MATURIDADE — o teto sobe sozinho aos 7, 30 e 90 dias de conta.
 *   * PADRÕES SUSPEITOS — farming e spam são padrões de VOLUME, só visíveis
 *     agregando uma janela; não há uma linha única para observar.
 *
 * Sem ela, a nota de quem não gera evento ficaria congelada no valor do dia em
 * que o último evento entrou — e a penalidade nunca expiraria de fato.
 *
 * Idempotente: recalcular duas vezes no mesmo dia dá o mesmo número (a nota é
 * derivada do extrato, não somada), e `raise_trust_flag` não duplica flag já
 * aberta. Rodar de novo após uma falha é seguro.
 *
 * Agendada em `vercel.json` para uma vez por dia.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { recalculated, flagged } = await runTrustDailyJob()

  return NextResponse.json({ ok: true, recalculated, flagged })
}
