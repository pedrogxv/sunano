import "server-only"

import type { AccountTier } from "@/lib/account-tier"
import { canEditComment } from "@/lib/comment-edit"
import type { CommentMention } from "@/components/comments/types"
import { buildProfileMap } from "@/lib/server/repositories/profile-enrichment"
import { creditPeripheralCommentCreationAura } from "@/lib/server/repositories/aura-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { completeDailyMission } from "@/lib/server/repositories/achievements-repository"

/**
 * Repositório de comentários de periférico — única porta de acesso à tabela
 * `peripheral_comments`. Mesmo desenho de `forum-repository.ts` (threads de
 * até 4 níveis, paginação por raiz, Aura), simplificado por não haver
 * conceito de post travado/oculto nem trilha de conquista dedicada — só a
 * missão diária "comentar" (`complete_daily_mission`) é reaproveitada.
 */

export type PeripheralCommentDetail = {
  id: string
  body: string
  author_name: string
  user_id: string | null
  parent_comment_id: string | null
  created_at: string
  is_edited: boolean
  aura_count: number
  image_urls: string[]
  mentions: CommentMention[]
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
  author_streak: number
}

export type CommentSort = "recent" | "aura"
export const PERIPHERAL_COMMENTS_PAGE_SIZE = 20

export type PaginatedPeripheralComments = {
  comments: PeripheralCommentDetail[]
  totalRootCount: number
  hasMore: boolean
}

const PERIPHERAL_COMMENT_COLUMNS =
  "id, body, author_name, user_id, parent_comment_id, created_at, is_edited, aura_count, image_urls, mentioned_user_ids"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPeripheralCommentRows(rows: any[], profileMap: Awaited<ReturnType<typeof buildProfileMap>>): PeripheralCommentDetail[] {
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    user_id: c.user_id,
    parent_comment_id: c.parent_comment_id ?? null,
    created_at: c.created_at,
    is_edited: c.is_edited ?? false,
    aura_count: c.aura_count ?? 0,
    image_urls: c.image_urls ?? [],
    mentions: ((c.mentioned_user_ids ?? []) as string[])
      .filter((id) => profileMap[id])
      .map((id) => ({
        id,
        display_name: profileMap[id]!.display_name ?? "Usuário",
        display_slug: profileMap[id]!.display_slug,
        avatar_url: profileMap[id]!.avatar_url,
      })),
    author_display_name: c.user_id ? profileMap[c.user_id]?.display_name ?? c.author_name : c.author_name,
    author_avatar_url: c.user_id ? profileMap[c.user_id]?.avatar_url ?? null : null,
    author_account_tier: c.user_id ? profileMap[c.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: c.user_id ? profileMap[c.user_id]?.display_slug ?? null : null,
    author_streak: c.user_id ? profileMap[c.user_id]?.streak ?? 0 : 0,
  }))
}

/**
 * Lista paginada dos comentários visíveis de um periférico. Mesma estratégia
 * de `listForumComments`: pagina por thread (comentário-raiz) e busca as
 * respostas (até nível 4) numa segunda/terceira/quarta consulta.
 */
export async function listPeripheralComments(
  peripheralId: string,
  { page = 1, sort = "recent" }: { page?: number; sort?: CommentSort } = {}
): Promise<PaginatedPeripheralComments> {
  const db = createSupabaseAdminClient()

  const from = (page - 1) * PERIPHERAL_COMMENTS_PAGE_SIZE
  const to = from + PERIPHERAL_COMMENTS_PAGE_SIZE - 1

  let rootQuery = db
    .from("peripheral_comments")
    .select(PERIPHERAL_COMMENT_COLUMNS, { count: "exact" })
    .eq("peripheral_id", peripheralId)
    .eq("is_hidden", false)
    .is("parent_comment_id", null)
  rootQuery =
    sort === "aura"
      ? rootQuery.order("aura_count", { ascending: false }).order("created_at", { ascending: false })
      : rootQuery.order("created_at", { ascending: false })
  const { data: rootRows, error: rootError, count } = await rootQuery.range(from, to)

  if (rootError) {
    console.error("[peripheral-comments-repository] listPeripheralComments (roots):", rootError.message)
    return { comments: [], totalRootCount: 0, hasMore: false }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roots = (rootRows ?? []) as any[]
  const totalRootCount = count ?? roots.length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let replies: any[] = []
  if (roots.length > 0) {
    const { data: level2Rows, error: level2Error } = await db
      .from("peripheral_comments")
      .select(PERIPHERAL_COMMENT_COLUMNS)
      .eq("peripheral_id", peripheralId)
      .eq("is_hidden", false)
      .in("parent_comment_id", roots.map((r) => r.id))
      .order("created_at", { ascending: true })
    if (level2Error) {
      console.error("[peripheral-comments-repository] listPeripheralComments (level 2):", level2Error.message)
    } else {
      replies = level2Rows ?? []
    }

    if (replies.length > 0) {
      const { data: level3Rows, error: level3Error } = await db
        .from("peripheral_comments")
        .select(PERIPHERAL_COMMENT_COLUMNS)
        .eq("peripheral_id", peripheralId)
        .eq("is_hidden", false)
        .in("parent_comment_id", replies.map((r) => r.id))
        .order("created_at", { ascending: true })
      if (level3Error) {
        console.error("[peripheral-comments-repository] listPeripheralComments (level 3):", level3Error.message)
      } else {
        const level3Rows_ = level3Rows ?? []
        replies = [...replies, ...level3Rows_]

        if (level3Rows_.length > 0) {
          const { data: level4Rows, error: level4Error } = await db
            .from("peripheral_comments")
            .select(PERIPHERAL_COMMENT_COLUMNS)
            .eq("peripheral_id", peripheralId)
            .eq("is_hidden", false)
            .in("parent_comment_id", level3Rows_.map((r) => r.id))
            .order("created_at", { ascending: true })
          if (level4Error) {
            console.error("[peripheral-comments-repository] listPeripheralComments (level 4):", level4Error.message)
          } else {
            replies = [...replies, ...(level4Rows ?? [])]
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = [...roots, ...(replies as any[])]
  const profileMap = await buildProfileMap([
    ...allRows.map((c) => c.user_id),
    ...allRows.flatMap((c) => (c.mentioned_user_ids ?? []) as string[]),
  ])

  return {
    comments: mapPeripheralCommentRows(allRows, profileMap),
    totalRootCount,
    hasMore: from + roots.length < totalRootCount,
  }
}

/** Quantidade total de comentários visíveis (raiz + respostas) de um periférico — pro cabeçalho da seção. */
export async function countPeripheralComments(peripheralId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count } = await db
    .from("peripheral_comments")
    .select("id", { count: "exact", head: true })
    .eq("peripheral_id", peripheralId)
    .eq("is_hidden", false)
  return count ?? 0
}

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

/** Adiciona um comentário a um periférico (thread de até 4 níveis, mesma reancoragem de forum_comments). */
export async function addPeripheralComment(params: {
  peripheralId: string
  userId: string
  authorName: string
  body: string
  parentCommentId?: string | null
  imageUrls?: string[]
  mentionedUserIds?: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: peripheral } = await db
    .from("peripherals")
    .select("id")
    .eq("id", params.peripheralId)
    .maybeSingle()
  if (!peripheral) return { ok: false, error: "Periférico não encontrado.", status: 404 }

  let parentCommentId: string | null = null
  if (params.parentCommentId) {
    const { data: parent } = await db
      .from("peripheral_comments")
      .select("id, peripheral_id, parent_comment_id")
      .eq("id", params.parentCommentId)
      .maybeSingle()
    if (!parent || parent.peripheral_id !== params.peripheralId) {
      return { ok: false, error: "Comentário original não encontrado.", status: 404 }
    }
    parentCommentId = parent.id
    if (parent.parent_comment_id) {
      const { data: grandparent } = await db
        .from("peripheral_comments")
        .select("id, parent_comment_id")
        .eq("id", parent.parent_comment_id)
        .maybeSingle()
      if (grandparent?.parent_comment_id) {
        const { data: greatGrandparent } = await db
          .from("peripheral_comments")
          .select("id, parent_comment_id")
          .eq("id", grandparent.parent_comment_id)
          .maybeSingle()
        if (greatGrandparent?.parent_comment_id) {
          parentCommentId = parent.parent_comment_id
        }
      }
    }
  }

  const { error } = await db.from("peripheral_comments").insert({
    peripheral_id: params.peripheralId,
    body: params.body.trim(),
    author_name: params.authorName,
    user_id: params.userId,
    parent_comment_id: parentCommentId,
    is_hidden: false,
    aura_count: 0,
    image_urls: params.imageUrls ?? [],
    mentioned_user_ids: params.mentionedUserIds ?? [],
  })

  if (error) {
    console.error("[peripheral-comments-repository] addPeripheralComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  // +5 de aura por comentar, 1x por periférico + missão diária "comentar" — best-effort.
  await creditPeripheralCommentCreationAura(params.userId, params.peripheralId)
  await completeDailyMission(params.userId, "comment")

  return { ok: true }
}

/** Reescreve um comentário do próprio autor, dentro da janela de edição de 15min. */
export async function updatePeripheralComment(params: {
  commentId: string
  userId: string
  body: string
  imageUrls?: string[]
  mentionedUserIds?: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: comment } = await db
    .from("peripheral_comments")
    .select("id, user_id, created_at, is_hidden")
    .eq("id", params.commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }
  if (comment.user_id !== params.userId) {
    return { ok: false, error: "Você só pode editar os seus comentários.", status: 403 }
  }
  if (!canEditComment(comment.created_at)) {
    return { ok: false, error: "O prazo de 15 minutos para editar este comentário já passou.", status: 403 }
  }

  const { error } = await db
    .from("peripheral_comments")
    .update({
      body: params.body.trim(),
      edited_at: new Date().toISOString(),
      ...(params.imageUrls !== undefined ? { image_urls: params.imageUrls } : {}),
      ...(params.mentionedUserIds !== undefined ? { mentioned_user_ids: params.mentionedUserIds } : {}),
    })
    .eq("id", comment.id)

  if (error) {
    console.error("[peripheral-comments-repository] updatePeripheralComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

/** Exclui (soft-delete via `is_hidden`) um comentário do próprio autor. */
export async function deleteOwnPeripheralComment(params: {
  commentId: string
  userId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: comment } = await db
    .from("peripheral_comments")
    .select("id, user_id, is_hidden")
    .eq("id", params.commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }
  if (comment.user_id !== params.userId) {
    return { ok: false, error: "Você só pode excluir os seus próprios comentários.", status: 403 }
  }

  const { error } = await db.from("peripheral_comments").update({ is_hidden: true }).eq("id", comment.id)
  if (error) {
    console.error("[peripheral-comments-repository] deleteOwnPeripheralComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}
