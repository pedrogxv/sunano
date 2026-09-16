import { NextRequest, NextResponse } from "next/server"

import { syncRankFrames } from "@/lib/server/repositories/rank-frames-repository"
import { isAuthorizedCronRequest } from "@/lib/server/secret-compare"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// As três varreduras trazem tabelas inteiras (`user_follows`, posts,
// comentários) para agregar em JS — é o mesmo full scan que `getFollowCounts`
// e `getActivityCounts` já fazem, mas sem o cache de 5 min, porque aqui o
// número precisa ser o de agora. 60s dá folga para a base crescer bastante
// antes de isto precisar virar RPC agregada no banco.
export const maxDuration = 60

/**
 * ⚠️ NÃO AGENDADA AINDA — o lançamento é manual.
 *
 * A rota está pronta, mas fora de `vercel.json` de propósito: a PRIMEIRA
 * execução concede as molduras a todo o pódio atual de uma vez e dispara uma
 * notificação para cada pessoa. Isso é o lançamento da feature, e quem
 * decide quando ele acontece é o dono do site — não um deploy.
 *
 * Para lançar: acrescente a entrada em `vercel.json`
 *   { "path": "/api/cron/rank-frames", "schedule": "0 * * * *" }
 * e faça o deploy. A partir daí a varredura roda de hora em hora e só
 * notifica quem ENTRA no pódio (a RPC devolve id novo uma vez só).
 *
 * Concede as molduras de pódio (ver `rank-frames-repository`).
 *
 * POR QUE É UM CRON, E NÃO UM TRIGGER: ranking não tem evento onde pendurar
 * um. Ninguém "atinge" o 1º lugar — a pessoa é 1º lugar enquanto ninguém a
 * ultrapassa, e a colocação muda quando um TERCEIRO ganha aura ou publica.
 * Não existe linha para observar, então a concessão é uma varredura.
 *
 * Idempotente: `grant_rank_frame` só insere na primeira vez, e só a inserção
 * nova gera notificação. Rodar duas vezes seguidas não concede nada a mais
 * nem duplica avisos.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { scanned, granted } = await syncRankFrames()

  return NextResponse.json({
    ok: true,
    scanned,
    granted: granted.length,
    // Útil no log da Vercel para conferir quem entrou no pódio sem abrir o
    // banco; são no máximo 9 entradas.
    details: granted.map((g) => ({
      user: g.displayName,
      frame: g.slug,
    })),
  })
}
