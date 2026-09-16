import "server-only"

import { cache } from "react"

import {
  MAX_PERIPHERAL_MENTIONS,
  buildMentionIndex,
  detectPeripherals,
  type MentionIndex,
} from "@/lib/peripheral-mentions"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { authorFrameFields, buildProfileMap, type AuthorFrameFields } from "@/lib/server/repositories/profile-enrichment"
import { listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"

/**
 * Repositório do vínculo `forum_post_peripherals` — periféricos citados num
 * tópico do fórum. Única porta de acesso à tabela.
 *
 * O detector em si (`lib/peripheral-mentions.ts`) é isomórfico e não toca no
 * banco: aqui só entram a montagem do índice a partir do catálogo e a
 * persistência do vínculo.
 */

export type MentionedPeripheral = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string | null
  tier: string | null
  /** Já montado — a página só precisa concatenar em `/perifericos/`. */
  slug: string
}

export type ForumPostMention = {
  slug: string
  title: string
  created_at: string
  /** Aura do post (somatório denormalizado dos comentários). */
  aura_count: number
  comment_count: number
  author_display_name: string
  author_avatar_url: string | null
  author_display_slug: string | null
  /** Tier/validade do autor — junto da moldura, completam o que `ProfileAvatar` precisa. */
  author_account_tier: string | null
  author_vip_expires_at: string | null
} & AuthorFrameFields

/**
 * Índice de menções montado a partir do catálogo inteiro.
 *
 * Duas camadas de cache e nenhuma consulta extra: `listAllPeripherals` já é
 * `unstable_cache` de 2 min (o mesmo full-scan que a tierlist e o ranking
 * usam), e o `cache()` do React deduplica por requisição. Montar o índice
 * custa ~1 ms para 576 periféricos, então não vale um cache próprio.
 */
export const getMentionIndex = cache(async (): Promise<MentionIndex> => {
  const peripherals = await listAllPeripherals()
  return buildMentionIndex(
    peripherals.map((p) => ({ id: p.id, name: p.name, brand: p.brand, category: p.category }))
  )
})

/**
 * Reconcilia os periféricos de um post.
 *
 * `confirmedIds` são os que o autor marcou no formulário; o servidor roda o
 * detector de novo sobre o texto salvo e grava a UNIÃO dos dois, sempre
 * validando contra o catálogo — o cliente nunca é fonte de verdade (mesmo
 * princípio de `mentioned_user_ids` nos comentários).
 *
 * Usa `delete` + `insert` em vez de upsert incremental porque o conjunto é
 * minúsculo (teto de 8) e assim uma edição que REMOVE uma citação também
 * remove o vínculo.
 */
export async function syncPostPeripherals(params: {
  postId: string
  text: string
  confirmedIds?: string[]
  source?: "auto" | "manual" | "backfill"
}): Promise<string[]> {
  const { postId, text, confirmedIds = [], source = "auto" } = params
  const db = createSupabaseAdminClient()

  const index = await getMentionIndex()
  const detected = detectPeripherals(text, index).map((m) => m.peripheralId)

  // União: o que o autor confirmou + o que o texto revela. `Set` preserva a
  // ordem de inserção, então o que o autor escolheu aparece primeiro.
  const union = [...new Set([...confirmedIds, ...detected])].slice(0, MAX_PERIPHERAL_MENTIONS)

  // Um id só entra se existir mesmo no catálogo — `confirmedIds` vem do
  // cliente e pode ser forjado, e um periférico apagado entre a digitação e o
  // envio violaria a FK.
  let valid: string[] = []
  if (union.length > 0) {
    const { data } = await db.from("peripherals").select("id").in("id", union)
    const existing = new Set((data ?? []).map((row) => row.id as string))
    valid = union.filter((id) => existing.has(id))
  }

  await db.from("forum_post_peripherals").delete().eq("post_id", postId)

  if (valid.length > 0) {
    const { error } = await db
      .from("forum_post_peripherals")
      .insert(valid.map((peripheralId) => ({ post_id: postId, peripheral_id: peripheralId, source })))
    if (error) {
      console.error("[forum-peripherals-repository] syncPostPeripherals:", error)
      return []
    }
  }

  return valid
}

/** Periféricos citados num post, para o card da sidebar e os chips do corpo. */
export async function getPeripheralsForPost(postId: string): Promise<MentionedPeripheral[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("forum_post_peripherals")
    .select("peripheral_id, peripherals(id, name, category, image_url, tier, brands(name))")
    .eq("post_id", postId)
    .limit(MAX_PERIPHERAL_MENTIONS)

  if (error) {
    console.error("[forum-peripherals-repository] getPeripheralsForPost:", error)
    return []
  }

  return (data ?? [])
    .map((row) => {
      // O join volta como objeto ou array de um elemento, dependendo de como o
      // PostgREST resolve a relação — mesmo tratamento do `mapBrandFields`.
      const raw = row as unknown as {
        peripherals:
          | {
              id: string
              name: string
              category: string
              image_url: string | null
              tier: string | null
              brands: { name: string } | { name: string }[] | null
            }
          | null
      }
      const p = raw.peripherals
      if (!p) return null
      const brandRow = Array.isArray(p.brands) ? p.brands[0] : p.brands
      return {
        id: p.id,
        name: p.name,
        brand: brandRow?.name ?? "",
        category: p.category,
        image_url: p.image_url,
        tier: p.tier,
        slug: buildPeripheralSlug(p.name, p.id),
      }
    })
    .filter((p): p is MentionedPeripheral => p !== null)
}

/**
 * Posts do fórum que citam um periférico — bloco "Discussões no fórum" da
 * ficha. É o link reverso: o que dá profundidade de interlinking entre os
 * dois acervos.
 *
 * Serve o índice `idx_forum_post_peripherals_peripheral`. Posts ocultos são
 * filtrados (não podem aparecer numa página pública indexável).
 */
export async function getPostsForPeripheral(
  peripheralId: string,
  limit = 5
): Promise<ForumPostMention[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("forum_post_peripherals")
    .select("forum_posts!inner(id, slug, title, created_at, is_hidden, aura_count, user_id, author_name)")
    .eq("peripheral_id", peripheralId)
    .eq("forum_posts.is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[forum-peripherals-repository] getPostsForPeripheral:", error)
    return []
  }

  type PostRow = {
    id: string
    slug: string
    title: string
    created_at: string
    aura_count: number | null
    user_id: string | null
    author_name: string
  }

  const posts = (data ?? [])
    .map((row) => {
      const raw = row as unknown as { forum_posts: PostRow | PostRow[] | null }
      return Array.isArray(raw.forum_posts) ? raw.forum_posts[0] : raw.forum_posts
    })
    .filter((post): post is PostRow => !!post)

  if (posts.length === 0) return []

  // Contagem de comentários e perfis dos autores em paralelo — o `select` com
  // `count` por post exigiria uma query por linha.
  const postIds = posts.map((post) => post.id)
  const [{ data: commentRows }, profileMap] = await Promise.all([
    db.from("forum_comments").select("post_id").in("post_id", postIds).eq("is_hidden", false),
    buildProfileMap(posts.map((post) => post.user_id)),
  ])

  const commentCounts: Record<string, number> = {}
  for (const comment of commentRows ?? []) {
    commentCounts[comment.post_id] = (commentCounts[comment.post_id] ?? 0) + 1
  }

  return posts.map((post) => {
    const profile = post.user_id ? profileMap[post.user_id] : null
    return {
      slug: post.slug,
      title: post.title,
      created_at: post.created_at,
      aura_count: post.aura_count ?? 0,
      comment_count: commentCounts[post.id] ?? 0,
      author_display_name: profile?.display_name || post.author_name || "Usuário",
      // `buildProfileMap` já devolve a URL pelo proxy — nunca a do Storage.
      author_avatar_url: profile?.avatar_url ?? null,
      author_display_slug: profile?.display_slug ?? null,
      author_account_tier: profile?.account_tier ?? null,
      author_vip_expires_at: profile?.vip_expires_at ?? null,
      ...authorFrameFields(profile),
    }
  })
}
