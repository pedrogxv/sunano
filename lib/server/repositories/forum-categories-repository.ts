import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório das categorias do fórum (`forum_categories`) — hierarquia de
 * 2 níveis (categoria > subcategoria), usada para classificar posts em vez
 * do antigo vínculo direto com periféricos.
 */

export type RepositoryResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

const COLUMNS = "id, parent_id, slug, name, sort_order, is_active, created_at, updated_at"

export type ForumCategory = {
  id: string
  parentId: string | null
  slug: string
  name: string
  sortOrder: number
  isActive: boolean
}

export type ForumCategoryNode = ForumCategory & { children: ForumCategory[] }

function toForumCategory(row: {
  id: string
  parent_id: string | null
  slug: string
  name: string
  sort_order: number
  is_active: boolean
}): ForumCategory {
  return {
    id: row.id,
    parentId: row.parent_id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

/** Árvore de categorias ativas — usada no formulário de novo post e nos filtros públicos. */
export async function listForumCategoriesPublic(): Promise<ForumCategoryNode[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("forum_categories")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[forum-categories-repository] listForumCategoriesPublic:", error)
    throw error
  }

  const rows = (data ?? []).map(toForumCategory)
  const roots = rows.filter((r) => !r.parentId)
  return roots.map((root) => ({
    ...root,
    children: rows.filter((r) => r.parentId === root.id),
  }))
}

/** Todas as categorias (inclusive inativas) — visão do painel admin. */
export async function listForumCategoriesForAdmin(): Promise<ForumCategory[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("forum_categories")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[forum-categories-repository] listForumCategoriesForAdmin:", error)
    throw error
  }

  return (data ?? []).map(toForumCategory)
}

export async function createForumCategory(input: {
  parentId: string | null
  slug: string
  name: string
}): Promise<{ ok: true; category: ForumCategory } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const siblingsQuery = db.from("forum_categories").select("sort_order")
  const { data: last } = await (input.parentId
    ? siblingsQuery.eq("parent_id", input.parentId)
    : siblingsQuery.is("parent_id", null)
  )
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await db
    .from("forum_categories")
    .insert({
      parent_id: input.parentId,
      slug: input.slug,
      name: input.name,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    console.error("[forum-categories-repository] createForumCategory:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true, category: toForumCategory(data) }
}

export async function updateForumCategory(
  id: string,
  patch: Partial<{ slug: string; name: string; isActive: boolean }>
): Promise<{ ok: true; category: ForumCategory } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("forum_categories")
    .update({
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()

  if (error) {
    console.error("[forum-categories-repository] updateForumCategory:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  if (!data) return { ok: false, error: "Categoria não encontrada.", status: 404 }
  return { ok: true, category: toForumCategory(data) }
}

/** Reordena categorias irmãs. Recebe os ids na ordem desejada (mesmo grupo de parent_id). */
export async function reorderForumCategories(orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("forum_categories").update({ sort_order: index }).eq("id", id)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[forum-categories-repository] reorderForumCategories:", failed.error)
    throw failed.error
  }
}

/**
 * Exclui uma categoria. Bloqueia se houver posts vinculados (sugere
 * desativar em vez de apagar) — evita deixar o `on delete restrict` do
 * banco estourar como erro cru.
 */
export async function deleteForumCategory(id: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { count } = await db
    .from("forum_posts")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "Existem posts nesta categoria. Desative-a em vez de excluir.",
      status: 409,
    }
  }

  const { count: childCount } = await db
    .from("forum_categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id)

  if ((childCount ?? 0) > 0) {
    return {
      ok: false,
      error: "Exclua ou mova as subcategorias antes de excluir esta categoria.",
      status: 409,
    }
  }

  const { error } = await db.from("forum_categories").delete().eq("id", id)
  if (error) {
    console.error("[forum-categories-repository] deleteForumCategory:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}
