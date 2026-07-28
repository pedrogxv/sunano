import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório dos banners da Home — acesso à tabela `home_banners`.
 *
 * O carrossel do topo da Home exibe no máximo `MAX_ACTIVE_BANNERS` banners
 * ativos, ordenados por `sort_order`.
 *
 * Dois conceitos distintos convivem aqui:
 * - **ativo** (`is_active`): o botão que o admin controla. É sobre ele que o
 *   limite de 7 é aplicado — o contador "N/7" do painel não muda sozinho.
 * - **no ar**: ativo *e* dentro da janela `starts_at`/`ends_at`. É o que a Home
 *   realmente exibe.
 *
 * O limite é verificado aqui (mensagem amigável) e também por trigger no banco
 * (rede de proteção contra dois admins salvando ao mesmo tempo).
 */

export const MAX_ACTIVE_BANNERS = 7

/** Bucket público onde as artes dos banners são guardadas. */
const STORAGE_BUCKET = "peripherals"

export type HomeBanner = {
  id: string
  image_url: string
  image_url_mobile: string | null
  link_url: string | null
  alt_text: string | null
  sort_order: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

/** Erro de domínio: tentativa de ter mais banners ativos que o permitido. */
export class ActiveBannerLimitError extends Error {
  constructor() {
    super(
      `Limite de ${MAX_ACTIVE_BANNERS} banners ativos atingido. Desative ou remova um banner antes de ativar outro.`
    )
    this.name = "ActiveBannerLimitError"
  }
}

/** O trigger do banco sinaliza o estouro do limite com esta marca na mensagem. */
function isActiveLimitViolation(error: { message?: string | null } | null) {
  return Boolean(error?.message?.includes("home_banners_active_limit"))
}

const COLUMNS =
  "id, image_url, image_url_mobile, link_url, alt_text, sort_order, is_active, starts_at, ends_at, created_at, updated_at"

export type BannerWriteInput = {
  imageUrl: string
  imageUrlMobile: string | null
  linkUrl: string | null
  altText: string | null
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
}

/**
 * Banners que devem aparecer no carrossel agora: ativos e dentro da janela de
 * veiculação. Já ordenados e limitados.
 */
export async function listActiveBanners(): Promise<HomeBanner[]> {
  const db = createSupabaseAdminClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await db
    .from("home_banners")
    .select(COLUMNS)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_ACTIVE_BANNERS)

  if (error) {
    console.error("[banners-repository] listActiveBanners:", error)
    throw error
  }

  return (data ?? []) as HomeBanner[]
}

/** Todos os banners (inclusive inativos e agendados) — visão do painel. */
export async function listAllBanners(): Promise<HomeBanner[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("home_banners")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[banners-repository] listAllBanners:", error)
    throw error
  }

  return (data ?? []) as HomeBanner[]
}

/** Quantos banners estão ativos hoje, ignorando opcionalmente um id (edição). */
export async function countActiveBanners(excludeId?: string): Promise<number> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("home_banners")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
  if (excludeId) query = query.neq("id", excludeId)

  const { count, error } = await query
  if (error) {
    console.error("[banners-repository] countActiveBanners:", error)
    throw error
  }

  return count ?? 0
}

/**
 * Cria um banner no fim da fila. Banner criado já ativo conta para o limite;
 * criado inativo, não.
 */
export async function createBanner(input: BannerWriteInput): Promise<HomeBanner> {
  if (input.isActive && (await countActiveBanners()) >= MAX_ACTIVE_BANNERS) {
    throw new ActiveBannerLimitError()
  }

  const db = createSupabaseAdminClient()

  // Fim da fila: maior sort_order existente + 1.
  const { data: last } = await db
    .from("home_banners")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await db
    .from("home_banners")
    .insert({
      image_url: input.imageUrl,
      image_url_mobile: input.imageUrlMobile,
      link_url: input.linkUrl,
      alt_text: input.altText,
      is_active: input.isActive,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    if (isActiveLimitViolation(error)) throw new ActiveBannerLimitError()
    console.error("[banners-repository] createBanner:", error)
    throw error
  }

  return data as HomeBanner
}

/** Atualiza qualquer subconjunto dos campos de um banner. */
export async function updateBanner(
  id: string,
  patch: Partial<BannerWriteInput>
): Promise<HomeBanner> {
  if (patch.isActive === true && (await countActiveBanners(id)) >= MAX_ACTIVE_BANNERS) {
    throw new ActiveBannerLimitError()
  }

  const db = createSupabaseAdminClient()

  // Antes de trocar a arte, guarda a antiga para remover do storage depois.
  const previous = patch.imageUrl !== undefined || patch.imageUrlMobile !== undefined
    ? await findBannerById(id)
    : null

  const { data, error } = await db
    .from("home_banners")
    .update({
      ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
      ...(patch.imageUrlMobile !== undefined ? { image_url_mobile: patch.imageUrlMobile } : {}),
      ...(patch.linkUrl !== undefined ? { link_url: patch.linkUrl } : {}),
      ...(patch.altText !== undefined ? { alt_text: patch.altText } : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
      ...(patch.startsAt !== undefined ? { starts_at: patch.startsAt } : {}),
      ...(patch.endsAt !== undefined ? { ends_at: patch.endsAt } : {}),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle()

  if (error) {
    if (isActiveLimitViolation(error)) throw new ActiveBannerLimitError()
    console.error("[banners-repository] updateBanner:", error)
    throw error
  }
  if (!data) {
    throw new Error("Banner não encontrado.")
  }

  const updated = data as HomeBanner
  if (previous) {
    const replaced = [previous.image_url, previous.image_url_mobile].filter(
      (url): url is string =>
        Boolean(url) && url !== updated.image_url && url !== updated.image_url_mobile
    )
    await removeUnreferencedImages(replaced)
  }

  return updated
}

async function findBannerById(id: string): Promise<HomeBanner | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("home_banners").select(COLUMNS).eq("id", id).maybeSingle()
  return (data as HomeBanner | null) ?? null
}

/** Remove um banner e limpa as artes que ficaram sem dono. */
export async function deleteBanner(id: string): Promise<void> {
  const db = createSupabaseAdminClient()

  const banner = await findBannerById(id)

  const { error } = await db.from("home_banners").delete().eq("id", id)
  if (error) {
    console.error("[banners-repository] deleteBanner:", error)
    throw error
  }

  if (banner) {
    await removeUnreferencedImages(
      [banner.image_url, banner.image_url_mobile].filter((url): url is string => Boolean(url))
    )
  }
}

/**
 * Apaga do storage as artes que nenhum outro banner referencia.
 *
 * A checagem antes de apagar evita quebrar um banner que reaproveite a mesma
 * imagem. Falha aqui não derruba a operação: sobrar arquivo é bem menos grave
 * que estourar um erro depois do registro já ter sido gravado.
 */
async function removeUnreferencedImages(urls: string[]): Promise<void> {
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
        .from("home_banners")
        .select("id", { count: "exact", head: true })
        .or(`image_url.eq.${url},image_url_mobile.eq.${url}`)

      if ((count ?? 0) > 0) continue

      paths.push(decodeURIComponent(url.slice(markerIndex + prefix.length).split("?")[0]))
    }

    if (paths.length > 0) {
      await db.storage.from(STORAGE_BUCKET).remove(paths)
    }
  } catch (error) {
    console.error("[banners-repository] removeUnreferencedImages:", error)
  }
}

/**
 * Reordena os banners. Recebe os ids na ordem desejada e grava o índice de
 * cada um em `sort_order`; ids desconhecidos são ignorados pelo `.eq`.
 */
export async function reorderBanners(orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("home_banners").update({ sort_order: index }).eq("id", id)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[banners-repository] reorderBanners:", failed.error)
    throw failed.error
  }
}
