import "server-only"

import {
  CHANGELOG_KEY_PATTERN,
  changelogFeedbackKeys,
  type ChangelogEntryFeedback,
  type ChangelogReaction,
  type ChangelogVote,
} from "@/lib/changelog-feedback"
import { ptBR } from "@/lib/i18n-pt-br"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Chaves que existem HOJE. Validar aqui (e não só o formato) impede gravar
 * voto em versão inventada: a coluna aceitaria qualquer slug, e a tabela
 * viraria depósito de lixo que ninguém lê.
 */
const KNOWN_KEYS = new Set(changelogFeedbackKeys(ptBR.changelog.entries))

export function isKnownChangelogKey(key: string) {
  return CHANGELOG_KEY_PATTERN.test(key) && KNOWN_KEYS.has(key)
}

/**
 * Totais de todas as versões + o que `userId` marcou. Duas consultas para a
 * página inteira: os totais já vêm agregados do banco (quem votou em quê não
 * sai do servidor) e as marcações da pessoa vêm pelo `user_id`.
 */
export async function getChangelogFeedback(userId: string | null): Promise<Record<string, ChangelogEntryFeedback>> {
  const db = createSupabaseAdminClient()

  const [totals, votes, reactions] = await Promise.all([
    db.rpc("changelog_feedback_totals"),
    userId
      ? db.from("changelog_votes").select("entry_key, value").eq("user_id", userId)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? db.from("changelog_reactions").select("entry_key, reaction").eq("user_id", userId)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (totals.error) throw totals.error
  if (votes.error) throw votes.error
  if (reactions.error) throw reactions.error

  const result: Record<string, ChangelogEntryFeedback> = {}
  const of = (key: string) =>
    (result[key] ??= { up: 0, down: 0, reactions: {}, myVote: 0, myReactions: [] })

  for (const row of totals.data ?? []) {
    // Versão retirada do changelog: os votos ficam no banco, mas não vão à tela.
    if (!KNOWN_KEYS.has(row.entry_key)) continue
    const entry = of(row.entry_key)
    const total = Number(row.total)
    if (row.kind === "up") entry.up = total
    else if (row.kind === "down") entry.down = total
    else entry.reactions[row.kind as ChangelogReaction] = total
  }
  for (const row of (votes.data ?? []) as { entry_key: string; value: -1 | 1 }[]) {
    if (KNOWN_KEYS.has(row.entry_key)) of(row.entry_key).myVote = row.value
  }
  for (const row of (reactions.data ?? []) as { entry_key: string; reaction: ChangelogReaction }[]) {
    if (KNOWN_KEYS.has(row.entry_key)) of(row.entry_key).myReactions.push(row.reaction)
  }
  return result
}

/**
 * Grava o ESTADO pedido (não um toggle): repetir a chamada dá o mesmo
 * resultado, então retry de rede e clique duplo não invertem o voto.
 */
export async function setChangelogVote(userId: string, entryKey: string, vote: ChangelogVote) {
  const db = createSupabaseAdminClient()
  const { error } =
    vote === 0
      ? await db.from("changelog_votes").delete().eq("user_id", userId).eq("entry_key", entryKey)
      : await db
          .from("changelog_votes")
          .upsert(
            { user_id: userId, entry_key: entryKey, value: vote, updated_at: new Date().toISOString() },
            { onConflict: "user_id,entry_key" }
          )
  if (error) throw error
}

export async function setChangelogReaction(
  userId: string,
  entryKey: string,
  reaction: ChangelogReaction,
  active: boolean
) {
  const db = createSupabaseAdminClient()
  const { error } = active
    ? await db
        .from("changelog_reactions")
        .upsert(
          { user_id: userId, entry_key: entryKey, reaction },
          { onConflict: "user_id,entry_key,reaction", ignoreDuplicates: true }
        )
    : await db
        .from("changelog_reactions")
        .delete()
        .eq("user_id", userId)
        .eq("entry_key", entryKey)
        .eq("reaction", reaction)
  if (error) throw error
}
