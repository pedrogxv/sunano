import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório dos banners de carrossel das seções da Loja — acesso à tabela
 * `store_section_banners`.
 *
 * Cada seção (`main`, `best_sellers`, `pre_sale`, `ready_stock`, `site_items`)
 * tem sua própria fila de banners, com `sort_order` independente das outras —
 * ao contrário de `home_banners` (Home global, uma fila só, limite de 7
 * ativos), aqui não há teto de banners ativos por seção. `main` é o hero do
 * topo da Loja — sem banner ativo, cai na imagem estática de sempre em vez
 * de virar grid (não existe "grid" pro hero).
 */

const STORAGE_BUCKET = "store-banners"

export type StoreBannerSection = "main" | "best_sellers" | "pre_sale" | "ready_stock" | "site_items"

export const STORE_BANNER_SECTIONS: StoreBannerSection[] = [
  "main",
  "best_sellers",
  "pre_sale",
  "ready_stock",
  "site_items",
]

export type StoreSectionBanner = {
  id: string
  section: StoreBannerSection
  image_url: string | null
  video_url: string | null
  title: string
  subtitle: string | null
  cta_text: string | null
  cta_link: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type StoreBannerWriteInput = {
  section: StoreBannerSection
  imageUrl: string | null
  videoUrl: string | null
  title: string
  subtitle: string | null
  ctaText: string | null
  ctaLink: string | null
  isActive: boolean
}

const COLUMNS =
  "id, section, image_url, video_url, title, subtitle, cta_text, cta_link, sort_order, is_active, created_at, updated_at"

function emptyGroups(): Record<StoreBannerSection, StoreSectionBanner[]> {
  return { main: [], best_sellers: [], pre_sale: [], ready_stock: [], site_items: [] }
}

/**
 * Banners ativos de todas as seções, já agrupados — uma query só a partir de
 * `app/loja/page.tsx` em vez de uma por seção.
 */
export async function listActiveBannersBySection(): Promise<
  Record<StoreBannerSection, StoreSectionBanner[]>
> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_section_banners")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[store-banners-repository] listActiveBannersBySection:", error)
    throw error
  }

  const grouped = emptyGroups()
  for (const row of (data ?? []) as StoreSectionBanner[]) {
    grouped[row.section].push(row)
  }
  return grouped
}

/** Todos os banners (inclusive inativos), ordenados por seção — visão do painel. */
export async function listAllBanners(): Promise<StoreSectionBanner[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_section_banners")
    .select(COLUMNS)
    .order("section", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[store-banners-repository] listAllBanners:", error)
    throw error
  }

  return (data ?? []) as StoreSectionBanner[]
}

/** Cria um banner no fim da fila da sua seção. */
export async function createBanner(input: StoreBannerWriteInput): Promise<StoreSectionBanner> {
  const db = createSupabaseAdminClient()

  // Fim da fila: maior sort_order existente NA MESMA SEÇÃO + 1.
  const { data: last } = await db
    .from("store_section_banners")
    .select("sort_order")
    .eq("section", input.section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await db
    .from("store_section_banners")
    .insert({
      section: input.section,
      image_url: input.imageUrl,
      video_url: input.videoUrl,
      title: input.title,
      subtitle: input.subtitle,
      cta_text: input.ctaText,
      cta_link: input.ctaLink,
      is_active: input.isActive,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    console.error("[store-banners-repository] createBanner:", error)
    throw error
  }

  return data as StoreSectionBanner
}

/** Atualiza qualquer subconjunto dos campos de um banner. */
export async function updateBanner(
  id: string,
  patch: Partial<StoreBannerWriteInput>
): Promise<StoreSectionBanner> {
  const db = createSupabaseAdminClient()

  // Antes de trocar a mídia, guarda a antiga para remover do storage depois.
  const previous =
    patch.imageUrl !== undefined || patch.videoUrl !== undefined ? await findBannerById(id) : null

  const { data, error } = await db
    .from("store_section_banners")
    .update({
      ...(patch.section !== undefined ? { section: patch.section } : {}),
      ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
      ...(patch.videoUrl !== undefined ? { video_url: patch.videoUrl } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}),
      ...(patch.ctaText !== undefined ? { cta_text: patch.ctaText } : {}),
      ...(patch.ctaLink !== undefined ? { cta_link: patch.ctaLink } : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()

  if (error) {
    console.error("[store-banners-repository] updateBanner:", error)
    throw error
  }
  if (!data) {
    throw new Error("Banner não encontrado.")
  }

  const updated = data as StoreSectionBanner
  if (previous) {
    const replaced = [previous.image_url, previous.video_url].filter(
      (url): url is string =>
        Boolean(url) && url !== updated.image_url && url !== updated.video_url
    )
    await removeUnreferencedMedia(replaced)
  }

  return updated
}

async function findBannerById(id: string): Promise<StoreSectionBanner | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("store_section_banners").select(COLUMNS).eq("id", id).maybeSingle()
  return (data as StoreSectionBanner | null) ?? null
}

/** Remove um banner e limpa a mídia que ficou sem dono. */
export async function deleteBanner(id: string): Promise<void> {
  const db = createSupabaseAdminClient()

  const banner = await findBannerById(id)

  const { error } = await db.from("store_section_banners").delete().eq("id", id)
  if (error) {
    console.error("[store-banners-repository] deleteBanner:", error)
    throw error
  }

  if (banner) {
    await removeUnreferencedMedia(
      [banner.image_url, banner.video_url].filter((url): url is string => Boolean(url))
    )
  }
}

/**
 * Apaga do storage as mídias que nenhum outro banner referencia (imagem ou
 * vídeo). A checagem antes de apagar evita quebrar um banner que reaproveite
 * o mesmo arquivo. Falha aqui não derruba a operação: sobrar arquivo é bem
 * menos grave que estourar um erro depois do registro já ter sido gravado.
 */
async function removeUnreferencedMedia(urls: string[]): Promise<void> {
  if (urls.length === 0) return

  const db = createSupabaseAdminClient()
  const prefix = `/storage/v1/object/public/${STORAGE_BUCKET}/`

  try {
    const paths: string[] = []

    for (const url of urls) {
      const markerIndex = url.indexOf(prefix)
      // Só mexe em arquivo do nosso bucket; URL externa colada à mão é ignorada.
      if (markerIndex === -1) continue

      const { count } = await db
        .from("store_section_banners")
        .select("id", { count: "exact", head: true })
        .or(`image_url.eq.${url},video_url.eq.${url}`)

      if ((count ?? 0) > 0) continue

      paths.push(decodeURIComponent(url.slice(markerIndex + prefix.length).split("?")[0]))
    }

    if (paths.length > 0) {
      await db.storage.from(STORAGE_BUCKET).remove(paths)
    }
  } catch (error) {
    console.error("[store-banners-repository] removeUnreferencedMedia:", error)
  }
}

/**
 * Reordena os banners de UMA seção. Recebe os ids na ordem desejada e grava
 * o índice de cada um em `sort_order`; ids desconhecidos são ignorados pelo
 * `.eq`. `sort_order` não é comparável entre seções diferentes, então a
 * reordenação nunca mexe fora da seção informada.
 */
export async function reorderBanners(
  section: StoreBannerSection,
  orderedIds: string[]
): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db
        .from("store_section_banners")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("section", section)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[store-banners-repository] reorderBanners:", failed.error)
    throw failed.error
  }
}
