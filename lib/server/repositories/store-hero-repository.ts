import "server-only"

import { cache } from "react"

import type { Database } from "@/lib/database.types"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { escapeOrFilterValue } from "@/lib/server/repositories/_shared"
import { getPeripheralRankById, listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { getStoreWideReviewAggregate } from "@/lib/server/repositories/store-reviews-repository"
import { listStoreProductsPaginated } from "@/lib/server/repositories/store-repository"
import { revalidateStorefront } from "@/lib/server/seo/revalidate-public"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  buildHeroView,
  DEFAULT_HERO_SETTINGS,
  isHeroHighlightKind,
  parseHeroSeals,
  type AdminStoreHeroSlide,
  type StoreHeroHighlightKind,
  type StoreHeroProductAnalysis,
  type StoreHeroSeal,
  type StoreHeroSettings,
  type StoreHeroSlide,
  type StoreHeroTrust,
  type StoreHeroView,
} from "@/lib/store-hero"

/**
 * Repositório do Hero da Loja: única porta para `store_hero_slides`
 * (20261204000000). A tabela não tem grant para cliente: a vitrine lê daqui
 * no servidor e o painel escreve pelas rotas de /api/admin/store-hero.
 *
 * As artes vão para o mesmo bucket dos banners de seção (`store-banners`),
 * pela mesma rota de upload.
 *
 * Também é a porta de `store_hero_settings` (20261211000000), a linha única
 * com os selos de curadoria que ficam colados no Hero.
 */

const STORAGE_BUCKET = "store-banners"

const COLUMNS =
  "id, title, subtitle, image_desktop_url, image_mobile_url, product_id, primary_cta_text, primary_cta_link, secondary_cta_text, secondary_cta_link, highlight, highlight_label, starts_at, ends_at, is_active, sort_order, created_at, updated_at"

type HeroRow = Database["public"]["Tables"]["store_hero_slides"]["Row"]

export type StoreHeroWriteInput = {
  title: string
  subtitle: string | null
  imageDesktopUrl: string | null
  imageMobileUrl: string | null
  productId: string | null
  primaryCtaText: string | null
  primaryCtaLink: string | null
  secondaryCtaText: string | null
  secondaryCtaLink: string | null
  highlight: StoreHeroHighlightKind | null
  highlightLabel: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
}

export type StoreHeroResult =
  | { ok: true; slide: AdminStoreHeroSlide }
  | { ok: false; error: string; status: number }

function toSlide(row: HeroRow): StoreHeroSlide {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageDesktopUrl: row.image_desktop_url,
    imageMobileUrl: row.image_mobile_url,
    productId: row.product_id,
    primaryCtaText: row.primary_cta_text,
    primaryCtaLink: row.primary_cta_link,
    secondaryCtaText: row.secondary_cta_text,
    secondaryCtaLink: row.secondary_cta_link,
    // Valor fora da lista (escrito à mão no banco) vira slide sem etiqueta.
    highlight: isHeroHighlightKind(row.highlight) ? row.highlight : null,
    highlightLabel: row.highlight_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRowPatch(input: Partial<StoreHeroWriteInput>): Database["public"]["Tables"]["store_hero_slides"]["Update"] {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
    ...(input.imageDesktopUrl !== undefined ? { image_desktop_url: input.imageDesktopUrl } : {}),
    ...(input.imageMobileUrl !== undefined ? { image_mobile_url: input.imageMobileUrl } : {}),
    ...(input.productId !== undefined ? { product_id: input.productId } : {}),
    ...(input.primaryCtaText !== undefined ? { primary_cta_text: input.primaryCtaText } : {}),
    ...(input.primaryCtaLink !== undefined ? { primary_cta_link: input.primaryCtaLink } : {}),
    ...(input.secondaryCtaText !== undefined ? { secondary_cta_text: input.secondaryCtaText } : {}),
    ...(input.secondaryCtaLink !== undefined ? { secondary_cta_link: input.secondaryCtaLink } : {}),
    ...(input.highlight !== undefined ? { highlight: input.highlight } : {}),
    ...(input.highlightLabel !== undefined ? { highlight_label: input.highlightLabel } : {}),
    ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
    ...(input.endsAt !== undefined ? { ends_at: input.endsAt } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  }
}

/**
 * Regras que dependem do slide INTEIRO (o que já está salvo + o que chegou),
 * por isso moram aqui e não no schema da rota, que só vê o PATCH:
 * - precisa de arte ou de produto (sem nenhum dos dois não há o que desenhar);
 * - o período tem de terminar depois de começar.
 */
function validateMerged(slide: Pick<StoreHeroSlide, "imageDesktopUrl" | "productId" | "startsAt" | "endsAt">): string | null {
  if (!slide.imageDesktopUrl && !slide.productId) {
    return "Envie a imagem de desktop ou escolha um produto relacionado."
  }
  if (slide.startsAt && slide.endsAt && new Date(slide.endsAt).getTime() <= new Date(slide.startsAt).getTime()) {
    return "O fim da campanha precisa ser depois do início."
  }
  return null
}

/** Painel: card do produto de cada slide, inclusive pausado (o painel avisa que ele não aparece). */
async function withProduct(slides: StoreHeroSlide[]): Promise<AdminStoreHeroSlide[]> {
  const ids = [...new Set(slides.map((slide) => slide.productId).filter((id): id is string => Boolean(id)))]
  const { items } = ids.length
    ? await listStoreProductsPaginated({ type: "store", productIds: ids, pageSize: ids.length, includeInactive: true })
    : { items: [] }
  const products = new Map(items.map((item) => [item.id, item]))
  return slides.map((slide) => ({ ...slide, product: slide.productId ? products.get(slide.productId) ?? null : null }))
}

/**
 * O produto em destaque visto pelo Database: o periférico vinculado e a
 * posição dele no ranking da categoria. Mesma precedência da página do
 * produto (`getStoreProductDetail`): o FK legado `store_products.peripheral_id`
 * primeiro, depois o primeiro da lista M:N. Falha aqui só tira a linha do
 * Database do slide; não derruba o Hero.
 */
async function getProductAnalyses(productIds: string[]): Promise<Map<string, StoreHeroProductAnalysis>> {
  const analyses = new Map<string, StoreHeroProductAnalysis>()
  if (productIds.length === 0) return analyses

  try {
    const db = createSupabaseAdminClient()
    const [{ data: legacy }, { data: links }, peripherals] = await Promise.all([
      db.from("store_products").select("id, peripheral_id").in("id", productIds),
      db
        .from("store_product_peripherals")
        .select("product_id, peripheral_id, position")
        .in("product_id", productIds)
        .order("position", { ascending: true }),
      listAllPeripherals(),
    ])

    const peripheralById = new Map(peripherals.map((peripheral) => [peripheral.id, peripheral]))
    const chosen = new Map<string, string>()
    for (const row of legacy ?? []) {
      if (row.peripheral_id && peripheralById.has(row.peripheral_id)) chosen.set(row.id, row.peripheral_id)
    }
    for (const row of links ?? []) {
      if (!chosen.has(row.product_id) && peripheralById.has(row.peripheral_id)) chosen.set(row.product_id, row.peripheral_id)
    }

    await Promise.all(
      [...chosen].map(async ([productId, peripheralId]) => {
        const peripheral = peripheralById.get(peripheralId)!
        analyses.set(productId, {
          peripheralName: peripheral.brand ? `${peripheral.brand} ${peripheral.name}` : peripheral.name,
          href: `/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`,
          rank: await getPeripheralRankById(peripheralId),
        })
      })
    )
  } catch (error) {
    console.error("[store-hero-repository] getProductAnalyses:", error)
  }
  return analyses
}

/**
 * Slides no ar agora, na ordem do painel, com botões resolvidos e o card do
 * produto (só produto ativo: um anúncio pausado não pode virar vitrine).
 * Slide sem arte cujo produto saiu do ar é pulado: não sobra nada para
 * desenhar. Erro de banco devolve lista vazia: a Loja cai na arte estática em
 * vez de quebrar a página inteira por causa do topo.
 */
export async function listLiveHeroSlides(): Promise<StoreHeroView[]> {
  const db = createSupabaseAdminClient()
  const now = escapeOrFilterValue(new Date().toISOString())

  const { data, error } = await db
    .from("store_hero_slides")
    .select(COLUMNS)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte."${now}"`)
    .or(`ends_at.is.null,ends_at.gt."${now}"`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[store-hero-repository] listLiveHeroSlides:", error)
    return []
  }

  const slides = (data ?? []).map((row) => toSlide(row as HeroRow))
  const productIds = [...new Set(slides.map((slide) => slide.productId).filter((id): id is string => Boolean(id)))]
  const [{ items: products }, analyses] = await Promise.all([
    productIds.length
      ? listStoreProductsPaginated({ type: "store", productIds, pageSize: productIds.length })
      : Promise.resolve({ items: [] }),
    getProductAnalyses(productIds),
  ])
  const productById = new Map(products.map((product) => [product.id, product]))

  return slides.flatMap<StoreHeroView>((slide) => {
    const product = slide.productId ? productById.get(slide.productId) ?? null : null
    const view = buildHeroView(slide, product, product ? analyses.get(product.id) ?? null : null)
    return view ? [view] : []
  })
}

/** Todos os slides (inclusive desativados, agendados e encerrados): visão do painel. */
export async function listAllHeroSlides(): Promise<AdminStoreHeroSlide[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_hero_slides")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[store-hero-repository] listAllHeroSlides:", error)
    throw error
  }

  return withProduct((data ?? []).map((row) => toSlide(row as HeroRow)))
}

async function findSlide(id: string): Promise<StoreHeroSlide | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("store_hero_slides").select(COLUMNS).eq("id", id).maybeSingle()
  return data ? toSlide(data as HeroRow) : null
}

/** Cria um slide no fim da fila. */
export async function createHeroSlide(input: StoreHeroWriteInput): Promise<StoreHeroResult> {
  const invalid = validateMerged(input)
  if (invalid) return { ok: false, error: invalid, status: 400 }

  const db = createSupabaseAdminClient()
  const { data: last } = await db
    .from("store_hero_slides")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await db
    .from("store_hero_slides")
    .insert({ ...toRowPatch(input), title: input.title, sort_order: (last?.sort_order ?? -1) + 1 })
    .select(COLUMNS)
    .single()

  if (error || !data) {
    console.error("[store-hero-repository] createHeroSlide:", error)
    return { ok: false, error: "Não foi possível criar o slide.", status: 500 }
  }

  revalidateStorefront()
  const [slide] = await withProduct([toSlide(data as HeroRow)])
  return { ok: true, slide }
}

/** Atualiza qualquer subconjunto dos campos; troca de arte apaga a antiga do storage. */
export async function updateHeroSlide(id: string, patch: Partial<StoreHeroWriteInput>): Promise<StoreHeroResult> {
  const previous = await findSlide(id)
  if (!previous) return { ok: false, error: "Slide não encontrado.", status: 404 }

  const invalid = validateMerged({
    imageDesktopUrl: patch.imageDesktopUrl !== undefined ? patch.imageDesktopUrl : previous.imageDesktopUrl,
    productId: patch.productId !== undefined ? patch.productId : previous.productId,
    startsAt: patch.startsAt !== undefined ? patch.startsAt : previous.startsAt,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : previous.endsAt,
  })
  if (invalid) return { ok: false, error: invalid, status: 400 }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_hero_slides")
    .update(toRowPatch(patch))
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()

  if (error) {
    console.error("[store-hero-repository] updateHeroSlide:", error)
    return { ok: false, error: "Não foi possível salvar o slide.", status: 500 }
  }
  if (!data) return { ok: false, error: "Slide não encontrado.", status: 404 }

  const updated = toSlide(data as HeroRow)
  const stillUsed = new Set([updated.imageDesktopUrl, updated.imageMobileUrl])
  await removeUnreferencedMedia(
    [previous.imageDesktopUrl, previous.imageMobileUrl].filter(
      (url): url is string => Boolean(url) && !stillUsed.has(url)
    )
  )

  revalidateStorefront()
  const [slide] = await withProduct([updated])
  return { ok: true, slide }
}

/** Remove um slide e limpa as artes que ficaram sem dono. */
export async function deleteHeroSlide(id: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const slide = await findSlide(id)
  if (!slide) return { ok: false, error: "Slide não encontrado.", status: 404 }

  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_hero_slides").delete().eq("id", id)
  if (error) {
    console.error("[store-hero-repository] deleteHeroSlide:", error)
    return { ok: false, error: "Não foi possível remover o slide.", status: 500 }
  }

  await removeUnreferencedMedia(
    [slide.imageDesktopUrl, slide.imageMobileUrl].filter((url): url is string => Boolean(url))
  )
  revalidateStorefront()
  return { ok: true }
}

/** Regrava `sort_order` na ordem recebida (arrastar-e-soltar do painel). */
export async function reorderHeroSlides(orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()
  const results = await Promise.all(
    orderedIds.map((id, index) => db.from("store_hero_slides").update({ sort_order: index }).eq("id", id))
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[store-hero-repository] reorderHeroSlides:", failed.error)
    throw failed.error
  }
  revalidateStorefront()
}

/**
 * Apaga do storage a arte que nenhum slide E nenhum banner de seção usa mais:
 * os dois compartilham o bucket `store-banners`, então checar só uma
 * tabela apagaria arquivo ainda em uso na outra. Falha aqui não derruba a
 * operação: sobrar arquivo é bem menos grave que errar depois de gravar.
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

      const safeUrl = escapeOrFilterValue(url)
      const [{ count: heroCount }, { count: bannerCount }] = await Promise.all([
        db
          .from("store_hero_slides")
          .select("id", { count: "exact", head: true })
          .or(`image_desktop_url.eq."${safeUrl}",image_mobile_url.eq."${safeUrl}"`),
        db
          .from("store_section_banners")
          .select("id", { count: "exact", head: true })
          .or(`image_url.eq."${safeUrl}",video_url.eq."${safeUrl}"`),
      ])
      if ((heroCount ?? 0) > 0 || (bannerCount ?? 0) > 0) continue

      paths.push(decodeURIComponent(url.slice(markerIndex + prefix.length).split("?")[0]))
    }

    if (paths.length > 0) {
      await db.storage.from(STORAGE_BUCKET).remove(paths)
    }
  } catch (error) {
    console.error("[store-hero-repository] removeUnreferencedMedia:", error)
  }
}

// ────────────────────────────────────────────
// Selos de curadoria (store_hero_settings)
// ────────────────────────────────────────────

const SETTINGS_COLUMNS = "seals_enabled, seals, show_rating"

type SettingsRow = Pick<
  Database["public"]["Tables"]["store_hero_settings"]["Row"],
  "seals_enabled" | "seals" | "show_rating"
>

function toSettings(row: SettingsRow): StoreHeroSettings {
  return { sealsEnabled: row.seals_enabled, seals: parseHeroSeals(row.seals), showRating: row.show_rating }
}

/**
 * Configuração dos selos. Sem a linha (ou com a migration ainda não aplicada)
 * devolve os selos padrão: é o posicionamento da Loja, não pode sumir do topo
 * por causa de um erro de leitura. `cache` deduplica dentro da renderização.
 */
export const getStoreHeroSettings = cache(async (): Promise<StoreHeroSettings> => {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_hero_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle()

  if (error || !data) {
    if (error) console.error("[store-hero-repository] getStoreHeroSettings:", error)
    return DEFAULT_HERO_SETTINGS
  }
  return toSettings(data as SettingsRow)
})

/** O que a vitrine desenha embaixo do Hero: selos ligados e a nota dos compradores. */
export async function getStoreHeroTrust(): Promise<StoreHeroTrust> {
  const settings = await getStoreHeroSettings()
  const aggregate = settings.showRating ? await getStoreWideReviewAggregate() : null
  return {
    seals: settings.sealsEnabled ? settings.seals : [],
    rating: aggregate && aggregate.count > 0 ? { average: aggregate.avgRating, count: aggregate.count } : null,
  }
}

export type StoreHeroSettingsWriteInput = {
  sealsEnabled: boolean
  seals: StoreHeroSeal[]
  showRating: boolean
  adminId: string
}

export type StoreHeroSettingsResult =
  | { ok: true; settings: StoreHeroSettings }
  | { ok: false; error: string; status: number }

export async function updateStoreHeroSettings(input: StoreHeroSettingsWriteInput): Promise<StoreHeroSettingsResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_hero_settings")
    .upsert(
      {
        id: true,
        seals_enabled: input.sealsEnabled,
        seals: input.seals,
        show_rating: input.showRating,
        updated_by: input.adminId,
      },
      { onConflict: "id" }
    )
    .select(SETTINGS_COLUMNS)
    .single()

  if (error || !data) {
    console.error("[store-hero-repository] updateStoreHeroSettings:", error)
    return { ok: false, error: "Não foi possível salvar os selos.", status: 500 }
  }

  revalidateStorefront()
  return { ok: true, settings: toSettings(data as SettingsRow) }
}
