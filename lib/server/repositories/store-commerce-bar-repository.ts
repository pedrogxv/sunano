import "server-only"

import { cache } from "react"

import type { Database } from "@/lib/database.types"
import { revalidateStorefront } from "@/lib/server/seo/revalidate-public"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  DEFAULT_COMMERCE_BAR,
  isCommerceCampaignTone,
  parseCommerceBenefits,
  type StoreCommerceBarConfig,
  type StoreCommerceBenefit,
  type CommerceCampaignTone,
} from "@/lib/store-commerce-bar"
import { productHref } from "@/lib/store-hero"

/**
 * Repositório da barra comercial da Loja: linha única de
 * `store_commerce_bar` (20261204000000). Sem grant para cliente: o layout de
 * /loja lê daqui no servidor e o painel grava por /api/admin/store-commerce-bar.
 */

const COLUMNS =
  "is_enabled, benefits, campaign_enabled, campaign_text, campaign_link_text, campaign_link, campaign_product_id, campaign_tone, campaign_starts_at, campaign_ends_at"

type BarRow = Pick<
  Database["public"]["Tables"]["store_commerce_bar"]["Row"],
  | "is_enabled"
  | "benefits"
  | "campaign_enabled"
  | "campaign_text"
  | "campaign_link_text"
  | "campaign_link"
  | "campaign_product_id"
  | "campaign_tone"
  | "campaign_starts_at"
  | "campaign_ends_at"
>

export type StoreCommerceBarWriteInput = {
  isEnabled: boolean
  benefits: StoreCommerceBenefit[]
  campaignEnabled: boolean
  campaignText: string | null
  campaignLinkText: string | null
  campaignLink: string | null
  campaignProductId: string | null
  campaignTone: CommerceCampaignTone
  campaignStartsAt: string | null
  campaignEndsAt: string | null
  adminId: string
}

/** Produto ativo da campanha: o slug vira o link quando o admin não digitou um. */
async function findActiveProductSlug(productId: string): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_products")
    .select("slug")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle()
  return data?.slug ?? null
}

async function toConfig(row: BarRow): Promise<StoreCommerceBarConfig> {
  const productSlug = row.campaign_product_id ? await findActiveProductSlug(row.campaign_product_id) : null
  return {
    isEnabled: row.is_enabled,
    benefits: parseCommerceBenefits(row.benefits),
    campaign: {
      enabled: row.campaign_enabled,
      text: row.campaign_text,
      linkText: row.campaign_link_text,
      link: row.campaign_link,
      productId: row.campaign_product_id,
      tone: isCommerceCampaignTone(row.campaign_tone) ? row.campaign_tone : "amber",
      startsAt: row.campaign_starts_at,
      endsAt: row.campaign_ends_at,
      href: row.campaign_link ?? (productSlug ? productHref(productSlug) : null),
    },
  }
}

/**
 * Configuração da barra. Sem a linha (ou com a migration ainda não aplicada)
 * devolve os benefícios padrão: a barra é informação de loja, não pode sumir
 * da vitrine por causa de um erro de leitura. `cache` deduplica a leitura
 * dentro de uma mesma renderização.
 */
export const getStoreCommerceBar = cache(async (): Promise<StoreCommerceBarConfig> => {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_commerce_bar").select(COLUMNS).eq("id", true).maybeSingle()

  if (error || !data) {
    if (error) console.error("[store-commerce-bar-repository] getStoreCommerceBar:", error)
    return DEFAULT_COMMERCE_BAR
  }
  return toConfig(data as BarRow)
})

export type StoreCommerceBarResult =
  | { ok: true; config: StoreCommerceBarConfig }
  | { ok: false; error: string; status: number }

export async function updateStoreCommerceBar(input: StoreCommerceBarWriteInput): Promise<StoreCommerceBarResult> {
  if (input.campaignEnabled && !input.campaignText) {
    return { ok: false, error: "Escreva o texto da campanha ou desligue o modo campanha.", status: 400 }
  }
  if (
    input.campaignStartsAt &&
    input.campaignEndsAt &&
    new Date(input.campaignEndsAt).getTime() <= new Date(input.campaignStartsAt).getTime()
  ) {
    return { ok: false, error: "O fim da campanha precisa ser depois do início.", status: 400 }
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_commerce_bar")
    .upsert(
      {
        id: true,
        is_enabled: input.isEnabled,
        benefits: input.benefits,
        campaign_enabled: input.campaignEnabled,
        campaign_text: input.campaignText,
        campaign_link_text: input.campaignLinkText,
        campaign_link: input.campaignLink,
        campaign_product_id: input.campaignProductId,
        campaign_tone: input.campaignTone,
        campaign_starts_at: input.campaignStartsAt,
        campaign_ends_at: input.campaignEndsAt,
        updated_by: input.adminId,
      },
      { onConflict: "id" }
    )
    .select(COLUMNS)
    .single()

  if (error || !data) {
    console.error("[store-commerce-bar-repository] updateStoreCommerceBar:", error)
    return { ok: false, error: "Não foi possível salvar a barra comercial.", status: 500 }
  }

  revalidateStorefront()
  return { ok: true, config: await toConfig(data as BarRow) }
}
