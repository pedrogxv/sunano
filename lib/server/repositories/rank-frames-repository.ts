import "server-only"

import {
  FRAME_RANK_BOARDS,
  FRAME_RANK_PLACES,
  rankFrame,
  rankFrameSlug,
  type FrameRankBoard,
  type FrameRankPlace,
} from "@/lib/profile-frames"
import { SITE_OWNER_SLUG } from "@/lib/special-tag"
import { notifyRankFrameGranted } from "@/lib/server/repositories/notifications-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Concessão das molduras de RANKING.
 *
 * ## O modelo: posse permanente, all-time
 *
 * Entrar no top 3 de um placar concede a moldura PARA SEMPRE; sair do pódio
 * não a tira. É o que faz a feature caber no resto do sistema — toda outra
 * moldura é posse permanente em `user_aura_items`, e uma revogável seria a
 * única que o site desequiparia sozinho do avatar de alguém, por causa da
 * atividade de um terceiro.
 *
 * ## Por que um cron, e não um trigger
 *
 * As outras molduras concedidas penduram trigger num ATO da pessoa: bateu o
 * marco de ofensiva, assinou o VIP. Ranking não tem esse ato — ninguém
 * "atinge" o 1º lugar, a pessoa É 1º lugar enquanto ninguém a ultrapassa, e
 * a colocação muda quando OUTRO usuário ganha aura. Não há linha para
 * observar. Por isso a concessão é uma varredura periódica
 * (`/api/cron/rank-frames`).
 *
 * ## Os placares são os mesmos de `/pessoas`
 *
 * A moldura tem de casar com o que o site mostra como ranking, senão alguém
 * recebe "1º em Aura" sem estar em 1º na tela. Por isso as três consultas
 * abaixo repetem as fontes e as EXCLUSÕES de `users-repository`: o dono do
 * site e as contas banidas ficam de fora, e os demais sobem uma posição.
 *
 * Ofensiva fica fora de propósito (`FRAME_RANK_BOARDS` não a inclui): o
 * placar é raso — 2º e 3º com zero dia —, então a moldura iria para quem não
 * fez nada.
 */

/** Um lugar do pódio, já resolvido para uma pessoa. */
export type RankFrameWinner = {
  userId: string
  board: FrameRankBoard
  place: FrameRankPlace
  slug: string
}

export type RankFrameGrant = RankFrameWinner & {
  /** Id do item concedido — vira o `entity_id` da notificação. */
  itemId: string
  /** Nome para a notificação — snapshot, igual ao resto de `notifications`. */
  displayName: string | null
}

export type RankFrameSyncResult = {
  /** Quantas pessoas estavam no pódio nesta varredura (top 3 × 3 placares). */
  scanned: number
  /** Só as concessões NOVAS — as que renderam notificação. */
  granted: RankFrameGrant[]
}

/**
 * Ids elegíveis a pódio: exclui o dono do site e contas banidas.
 *
 * Retorna um Set para filtrar as três consultas com uma leitura só; as
 * fontes de ranking (carteira de aura, `user_follows`, contagem de posts)
 * não têm como aplicar esse filtro sozinhas, porque a regra mora em
 * `user_profiles`.
 */
async function fetchEligibleIds(): Promise<Set<string>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select("id")
    .neq("display_slug", SITE_OWNER_SLUG)
    .is("account_banned_at", null)

  if (error) {
    console.error("[rank-frames] fetchEligibleIds:", error)
    return new Set()
  }
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id))
}

/** Top 3 de Aura — `user_aura_wallet.balance`, a mesma fonte de `/pessoas`. */
async function topAura(eligible: Set<string>): Promise<string[]> {
  const db = createSupabaseAdminClient()
  // Busca com folga: o dono do site e banidos podem estar entre os
  // primeiros, e são descartados depois do banco.
  const { data, error } = await db
    .from("user_aura_wallet")
    .select("user_id, balance")
    .gt("balance", 0)
    .order("balance", { ascending: false })
    .limit(32)

  if (error) {
    console.error("[rank-frames] topAura:", error)
    return []
  }
  return ((data ?? []) as Array<{ user_id: string }>)
    .map((r) => r.user_id)
    .filter((id) => eligible.has(id))
    .slice(0, 3)
}

/**
 * Top 3 de Seguidores. Agrega `user_follows` em JS porque não existe coluna
 * nem view de contagem — mesma razão de `getFollowCounts`.
 */
async function topFollowers(eligible: Set<string>): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("user_follows").select("following_id")

  if (error) {
    console.error("[rank-frames] topFollowers:", error)
    return []
  }

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ following_id: string }>) {
    if (!eligible.has(row.following_id)) continue
    counts.set(row.following_id, (counts.get(row.following_id) ?? 0) + 1)
  }
  return rankTop3(counts)
}

/**
 * Top 3 de Atividade — posts + comentários de fórum + comentários de blog,
 * ignorando os ocultos. Mesma definição de `getActivityCounts`.
 */
async function topActivity(eligible: Set<string>): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const [posts, comments, blogComments] = await Promise.all([
    db.from("forum_posts").select("user_id").eq("is_hidden", false),
    db.from("forum_comments").select("user_id").eq("is_hidden", false),
    db.from("blog_comments").select("user_id").eq("is_hidden", false),
  ])

  const counts = new Map<string, number>()
  for (const res of [posts, comments, blogComments]) {
    if (res.error) {
      console.error("[rank-frames] topActivity:", res.error)
      continue
    }
    for (const row of (res.data ?? []) as Array<{ user_id: string | null }>) {
      if (!row.user_id || !eligible.has(row.user_id)) continue
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
    }
  }
  return rankTop3(counts)
}

/**
 * Os três maiores de um mapa de contagem.
 *
 * O desempate é pelo id, e não pela ordem de chegada do `Map`: sem um
 * critério estável, dois usuários empatados trocariam de lugar entre
 * varreduras e cada troca concederia uma moldura nova a mais gente. Com
 * posse permanente isso não desfaz nada, mas gera notificação repetida de
 * "você entrou no pódio" para quem nunca saiu.
 */
function rankTop3(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => id)
}

const BOARD_QUERIES: Record<
  FrameRankBoard,
  (eligible: Set<string>) => Promise<string[]>
> = {
  aura: topAura,
  followers: topFollowers,
  activity: topActivity,
}

/** O pódio atual dos três placares, achatado em uma lista. */
export async function getCurrentRankWinners(): Promise<RankFrameWinner[]> {
  const eligible = await fetchEligibleIds()
  if (eligible.size === 0) return []

  const boards = await Promise.all(
    FRAME_RANK_BOARDS.map(async (board) => ({
      board,
      ids: await BOARD_QUERIES[board](eligible),
    }))
  )

  const winners: RankFrameWinner[] = []
  for (const { board, ids } of boards) {
    ids.forEach((userId, index) => {
      const place = FRAME_RANK_PLACES[index]
      if (!place) return
      winners.push({ userId, board, place, slug: rankFrameSlug(board, place) })
    })
  }
  return winners
}

/**
 * Concede as molduras do pódio atual e devolve só as concessões NOVAS.
 *
 * A RPC `grant_rank_frame` é idempotente (`on conflict do nothing`) e retorna
 * `true` apenas quando a linha foi criada agora — é isso que separa "entrou
 * no pódio" de "continua no pódio". Sem essa distinção o cron notificaria a
 * mesma pessoa de hora em hora.
 */
export async function syncRankFrames(): Promise<RankFrameSyncResult> {
  const db = createSupabaseAdminClient()
  const winners = await getCurrentRankWinners()
  if (winners.length === 0) return { scanned: 0, granted: [] }

  const fresh: Array<RankFrameWinner & { itemId: string }> = []
  for (const winner of winners) {
    const { data, error } = await db.rpc("grant_rank_frame", {
      p_user_id: winner.userId,
      p_slug: winner.slug,
    })
    if (error) {
      console.error("[rank-frames] grant_rank_frame:", winner.slug, error)
      continue
    }
    // `null` = já tinha a moldura. Só id novo vira notificação.
    if (typeof data === "string") fresh.push({ ...winner, itemId: data })
  }

  if (fresh.length === 0) return { scanned: winners.length, granted: [] }

  // Nome só de quem foi concedido agora — a notificação precisa dele, e é
  // uma consulta em lote, nunca uma por vencedor.
  const { data: profiles } = await db
    .from("user_profiles")
    .select("id, display_name")
    .in("id", [...new Set(fresh.map((w) => w.userId))])

  const names = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map(
      (r) => [r.id, r.display_name]
    )
  )

  const granted: RankFrameGrant[] = fresh.map((w) => ({
    ...w,
    displayName: names.get(w.userId) ?? null,
  }))

  // Notifica em paralelo: são poucos (no máximo 9 numa varredura em que TUDO
  // é novo, e depois da primeira execução quase sempre 0 ou 1). Cada chamada
  // é best-effort e não lança, então um aviso que falhe não interrompe os
  // outros nem desfaz a posse já concedida.
  await Promise.all(
    granted.map((w) =>
      notifyRankFrameGranted({
        userId: w.userId,
        itemId: w.itemId,
        frameName: rankFrame(w.board, w.place).name,
        boardLabel: rankBoardLabel(w.board),
        place: w.place,
      })
    )
  )

  return { scanned: winners.length, granted }
}

/** Nome legível do placar, para a notificação. */
export function rankBoardLabel(board: FrameRankBoard): string {
  return rankFrame(board, 1).name.replace(/^1º em /, "")
}
