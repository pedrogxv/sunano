import type { AccountTier } from "@/lib/account-tier"

/**
 * Shape unificado de comentário (raiz ou resposta), usado tanto pelo fórum
 * quanto por notícias — `ForumCommentDetail` e `BlogCommentDetail` já são
 * estruturalmente idênticos a este tipo.
 */
export type CommentItem = {
  id: string
  body: string
  /** Autor da conta — usado para liberar o botão "Editar" só para ele. */
  user_id: string | null
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
  parent_comment_id: string | null
  created_at: string
  /** `edited_at is not null` no banco — liga o rótulo "(editado)". */
  is_edited: boolean
  aura_count: number
}

export type CommentsAuthUser = { id: string; display_name: string; avatar_url: string | null } | null
