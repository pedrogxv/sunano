import "server-only"

import { cache } from "react"

import type { Database } from "@/lib/database.types"
import { listStoreProductsPaginated, type StoreProductCard } from "@/lib/server/repositories/store-repository"
import { revalidateStorefront } from "@/lib/server/seo/revalidate-public"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isStoreCampaignTheme, type StoreCampaign, type StoreCampaignTheme } from "@/lib/store-campaigns"

/**
 * Campanhas sazonais da Loja (`store_campaigns` + `store_campaign_products`,
 * migration 20270110000000). Sem grant para cliente: /loja lê daqui no
 * servidor e o painel grava por /api/admin/store-campaigns.
 */

type CampaignRow = Pick<
  Database["public"]["Tables"]["store_campaigns"]["Row"],
  "id" | "theme" | "title" | "subtitle" | "starts_at" | "ends_at" | "is_enabled"
>

const COLUMNS = "id, theme, title, subtitle, starts_at, ends_at, is_enabled"

/** Campanha com tema que o código não conhece mais (removido do registro) não desenha. */
function toCampaign(row: CampaignRow): StoreCampaign | null {
  if (!isStoreCampaignTheme(row.theme)) return null
  return {
    id: row.id,
    theme: row.theme,
    title: row.title,
    subtitle: row.subtitle,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isEnabled: row.is_enabled,
  }
}

async function getProductIds(campaignId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_campaign_products")
    .select("product_id")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true })
  if (error) {
    console.error("[store-campaigns-repository] getProductIds:", error)
    return []
  }
  return (data ?? []).map((row) => row.product_id)
}

/** Cards na ordem escolhida pelo admin. A listagem devolve na ordem dela; a posição é reaplicada aqui. */
async function loadProductsInOrder(ids: string[], includeInactive: boolean): Promise<StoreProductCard[]> {
  if (ids.length === 0) return []
  const { items } = await listStoreProductsPaginated({ type: "store", productIds: ids, pageSize: ids.length, includeInactive })
  const rank = new Map(ids.map((id, index) => [id, index]))
  return items.filter((item) => rank.has(item.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
}

export type StoreLiveCampaign = StoreCampaign & { products: StoreProductCard[] }

/**
 * A campanha no ar agora, com os produtos ATIVOS dela. Sem produto ativo ela
 * não aparece: o cabeçalho com contador e um trilho vazio prometeria oferta
 * que não existe. Erro de leitura (ou migration não aplicada) = sem campanha,
 * e a Home segue com os Destaques de sempre.
 */
export const getLiveStoreCampaign = cache(async (): Promise<StoreLiveCampaign | null> => {
  const db = createSupabaseAdminClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from("store_campaigns")
    .select(COLUMNS)
    .eq("is_enabled", true)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("[store-campaigns-repository] getLiveStoreCampaign:", error)
    return null
  }
  const campaign = toCampaign(data as CampaignRow)
  if (!campaign) return null

  const products = await loadProductsInOrder(await getProductIds(campaign.id), false)
  return products.length > 0 ? { ...campaign, products } : null
})

export type AdminStoreCampaignSummary = StoreCampaign & { productCount: number }

/** Lista do painel: as mais recentes primeiro (a próxima/atual no topo). */
export async function listStoreCampaigns(): Promise<AdminStoreCampaignSummary[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_campaigns").select(COLUMNS).order("starts_at", { ascending: false })
  if (error) throw new Error(error.message)

  const campaigns = (data ?? []).map((row) => toCampaign(row as CampaignRow)).filter((c): c is StoreCampaign => c !== null)
  if (campaigns.length === 0) return []

  const { data: links, error: linksError } = await db
    .from("store_campaign_products")
    .select("campaign_id")
    .in("campaign_id", campaigns.map((c) => c.id))
  if (linksError) throw new Error(linksError.message)

  const counts = new Map<string, number>()
  for (const link of links ?? []) counts.set(link.campaign_id, (counts.get(link.campaign_id) ?? 0) + 1)
  return campaigns.map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }))
}

export type AdminStoreCampaignDetail = StoreCampaign & { products: StoreProductCard[] }

/** Uma campanha para o editor, com os produtos inclusive pausados (o painel avisa, não esconde). */
export async function getStoreCampaign(id: string): Promise<AdminStoreCampaignDetail | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_campaigns").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const campaign = toCampaign(data as CampaignRow)
  if (!campaign) return null
  return { ...campaign, products: await loadProductsInOrder(await getProductIds(id), true) }
}

export type StoreCampaignWriteInput = {
  /** `null` cria uma nova. */
  id: string | null
  theme: StoreCampaignTheme
  title: string
  subtitle: string | null
  startsAt: string
  endsAt: string
  isEnabled: boolean
  productIds: string[]
  adminId: string
}

export type StoreCampaignWriteResult = { ok: true; id: string } | { ok: false; error: string; status: number }

export async function saveStoreCampaign(input: StoreCampaignWriteInput): Promise<StoreCampaignWriteResult> {
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    return { ok: false, error: "O fim da campanha precisa ser depois do início.", status: 400 }
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("save_store_campaign", {
    p_id: input.id,
    p_theme: input.theme,
    p_title: input.title,
    p_subtitle: input.subtitle,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_is_enabled: input.isEnabled,
    p_product_ids: input.productIds,
    p_admin_id: input.adminId,
  })

  if (error) {
    // Constraint de exclusão: outra campanha ligada no mesmo período.
    if (error.code === "23P01") {
      return {
        ok: false,
        error: "Já existe outra campanha ligada nesse período. Desligue-a ou ajuste as datas.",
        status: 409,
      }
    }
    if (error.code === "P0002") return { ok: false, error: "Campanha não encontrada.", status: 404 }
    if (error.code === "23503") return { ok: false, error: "Um dos produtos não existe mais.", status: 400 }
    console.error("[store-campaigns-repository] saveStoreCampaign:", error)
    return { ok: false, error: "Erro ao salvar a campanha.", status: 500 }
  }

  revalidateStorefront()
  return { ok: true, id: data }
}

export async function deleteStoreCampaign(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_campaigns").delete().eq("id", id).select("id")
  if (error) throw new Error(error.message)
  revalidateStorefront()
  return (data ?? []).length > 0
}
