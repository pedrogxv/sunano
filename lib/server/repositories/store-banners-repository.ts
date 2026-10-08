import "server-only"

import { escapeOrFilterValue } from "@/lib/server/repositories/_shared"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { revalidateStorefront } from "@/lib/server/seo/revalidate-public"

/**
 * Repositório dos banners de carrossel da Loja — acesso à tabela
 * `store_section_banners`.
 *
 * O único lugar onde eles aparecem hoje é o topo de cada página de categoria
 * (`section = 'category'` + a coluna `category`, migration `20261221000000`),
 * no lugar do cabeçalho padrão. Cada categoria tem a própria fila, com
 * `sort_order` independente das outras.
 *
 * As seções antigas (`main`, `best_sellers`, `pre_sale`, `ready_stock`,
 * `site_items`) eram carrosséis no meio da Home e saíram do ar. Continuam
 * válidas no banco para os banners que já existiam nelas não sumirem: o
 * painel os lista à parte e deixa movê-los para uma categoria.
 */

const STORAGE_BUCKET = "store-banners"

export type StoreBannerSection =
  | "category"
  | "main"
  | "best_sellers"
  | "pre_sale"
  | "ready_stock"
  | "site_items"

export type StoreSectionBanner = {
  id: string
  section: StoreBannerSection
  /** Só na seção `category`: o valor de `store_products.category`. */
  category: string | null
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

/** Todo banner novo (ou movido) é de categoria; as seções antigas não recebem mais nada. */
export type StoreBannerWriteInput = {
  category: string
  imageUrl: string | null
  videoUrl: string | null
  title: string
  subtitle: string | null
  ctaText: string | null
  ctaLink: string | null
  isActive: boolean
}

const COLUMNS =
  "id, section, category, image_url, video_url, title, subtitle, cta_text, cta_link, sort_order, is_active, created_at, updated_at"

/** Banners ativos do topo de uma categoria, na ordem do painel. */
export async function listActiveCategoryBanners(category: string): Promise<StoreSectionBanner[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_section_banners")
    .select(COLUMNS)
    .eq("section", "category")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[store-banners-repository] listActiveCategoryBanners:", error)
    throw error
  }

  return (data ?? []) as StoreSectionBanner[]
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

/** Maior `sort_order` da fila da categoria + 1: o banner entra no fim. */
async function nextCategorySortOrder(category: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { data: last } = await db
    .from("store_section_banners")
    .select("sort_order")
    .eq("section", "category")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (last?.sort_order ?? -1) + 1
}

/** Cria um banner no fim da fila da sua categoria. */
export async function createBanner(input: StoreBannerWriteInput): Promise<StoreSectionBanner> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("store_section_banners")
    .insert({
      section: "category",
      category: input.category,
      image_url: input.imageUrl,
      video_url: input.videoUrl,
      title: input.title,
      subtitle: input.subtitle,
      cta_text: input.ctaText,
      cta_link: input.ctaLink,
      is_active: input.isActive,
      sort_order: await nextCategorySortOrder(input.category),
    })
    .select(COLUMNS)
    .single()

  if (error) {
    console.error("[store-banners-repository] createBanner:", error)
    throw error
  }

  revalidateStorefront()
  return data as StoreSectionBanner
}

/**
 * Atualiza qualquer subconjunto dos campos de um banner. Trocar a categoria
 * (ou dar uma a um banner de seção antiga) move o banner para o FIM da fila
 * da categoria nova: o `sort_order` da antiga não diz nada lá.
 */
export async function updateBanner(
  id: string,
  patch: Partial<StoreBannerWriteInput>
): Promise<StoreSectionBanner> {
  const db = createSupabaseAdminClient()

  // Antes de trocar a mídia, guarda a antiga para remover do storage depois.
  const previous =
    patch.imageUrl !== undefined || patch.videoUrl !== undefined || patch.category !== undefined
      ? await findBannerById(id)
      : null
  const moving =
    patch.category !== undefined &&
    (previous?.section !== "category" || previous?.category !== patch.category)

  const { data, error } = await db
    .from("store_section_banners")
    .update({
      ...(moving
        ? {
            section: "category",
            category: patch.category,
            sort_order: await nextCategorySortOrder(patch.category!),
          }
        : {}),
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

  revalidateStorefront()

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
  revalidateStorefront()

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

      // `url` vai entre aspas e escapado: sem isso, uma URL com vírgula ou
      // ponto quebra a gramática do `.or()` do PostgREST e a contagem de
      // referências volta errada — o arquivo seria apagado ainda em uso, ou a
      // query erraria e derrubaria a limpeza inteira.
      const safeUrl = escapeOrFilterValue(url)
      // O Hero da Loja (store_hero_slides) sobe arte para o mesmo bucket:
      // arquivo em uso lá também não pode sair daqui.
      const [{ count }, { count: heroCount }] = await Promise.all([
        db
          .from("store_section_banners")
          .select("id", { count: "exact", head: true })
          .or(`image_url.eq."${safeUrl}",video_url.eq."${safeUrl}"`),
        db
          .from("store_hero_slides")
          .select("id", { count: "exact", head: true })
          .or(`image_desktop_url.eq."${safeUrl}",image_mobile_url.eq."${safeUrl}"`),
      ])

      if ((count ?? 0) > 0 || (heroCount ?? 0) > 0) continue

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
 * Reordena os banners de UMA categoria. Recebe os ids na ordem desejada e
 * grava o índice de cada um em `sort_order`; ids desconhecidos são ignorados
 * pelo `.eq`. `sort_order` não é comparável entre categorias diferentes, então
 * a reordenação nunca mexe fora da categoria informada.
 */
export async function reorderBanners(category: string, orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db
        .from("store_section_banners")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("section", "category")
        .eq("category", category)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[store-banners-repository] reorderBanners:", failed.error)
    throw failed.error
  }
  revalidateStorefront()
}
