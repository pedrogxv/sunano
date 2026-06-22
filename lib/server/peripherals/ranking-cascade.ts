import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

type PeerRow = {
  id: string
  specs: Record<string, unknown>
}

export function getRankingFromSpecs(specs: Record<string, unknown> | undefined | null): number | null {
  if (!specs) return null
  const details = specs.details as Record<string, unknown> | undefined
  const r = details?.ranking
  return typeof r === "number" && r > 0 ? r : null
}

/**
 * Reposiciona em cascata todos os periféricos da mesma categoria quando o
 * ranking de um item muda, é removido, ou um novo item entra no ranking.
 *
 * - Inserção (oldRanking=null, newRanking=N): todos com ranking >= N sobem +1
 * - Remoção  (oldRanking=N, newRanking=null): todos com ranking > N descem -1
 * - Subida   (oldRanking=P, newRanking=N, N < P): itens em [N, P-1] sobem +1
 * - Descida  (oldRanking=P, newRanking=N, N > P): itens em [P+1, N] descem -1
 */
export async function cascadeRerank(
  db: SupabaseClient,
  category: string,
  changedId: string,
  oldRanking: number | null,
  newRanking: number | null
): Promise<void> {
  if (oldRanking === newRanking) return

  const { data: peers, error } = await (db.from("peripherals") as any)
    .select("id, specs")
    .eq("category", category)
    .neq("id", changedId)

  if (error || !peers || peers.length === 0) return

  const ranked = (peers as PeerRow[])
    .map((p) => ({ id: p.id, specs: p.specs, ranking: getRankingFromSpecs(p.specs) }))
    .filter((p): p is { id: string; specs: Record<string, unknown>; ranking: number } => p.ranking !== null)

  const updates: Array<{ id: string; nr: number; specs: Record<string, unknown> }> = []

  for (const peer of ranked) {
    let shift = 0

    if (newRanking !== null && oldRanking !== null) {
      if (newRanking < oldRanking) {
        if (peer.ranking >= newRanking && peer.ranking <= oldRanking - 1) shift = 1
      } else {
        if (peer.ranking >= oldRanking + 1 && peer.ranking <= newRanking) shift = -1
      }
    } else if (newRanking !== null) {
      if (peer.ranking >= newRanking) shift = 1
    } else if (oldRanking !== null) {
      if (peer.ranking > oldRanking) shift = -1
    }

    if (shift !== 0) {
      updates.push({ id: peer.id, nr: peer.ranking + shift, specs: peer.specs })
    }
  }

  if (updates.length === 0) return

  await Promise.all(
    updates.map(({ id, nr, specs }) => {
      const details = (specs.details as Record<string, unknown>) ?? {}
      return (db.from("peripherals") as any)
        .update({ specs: { ...specs, details: { ...details, ranking: nr } } })
        .eq("id", id)
    })
  )
}
