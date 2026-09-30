import "server-only"

import type { NextRequest } from "next/server"

import { normalizeAffiliateCode } from "@/lib/affiliate-code"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getAffiliateByCode } from "@/lib/server/repositories/affiliates-repository"

/**
 * Atribuição de uma venda a um afiliado. Duas origens, uma regra só:
 *
 * - o cookie `sn_aff_ref`, gravado pelo proxy quando a pessoa chega por um
 *   link `?ref=CODIGO` (janela de 30 dias);
 * - a escolha explícita no seletor "Apoie um afiliado" do checkout, que ganha
 *   do cookie (inclusive quando a escolha é "nenhum").
 *
 * Mora aqui, e não na rota do checkout, porque a rota que lista os afiliados
 * para o seletor também precisa ler o cookie para pré-selecionar quem indicou.
 */

const AFFILIATE_REF_COOKIE = "sn_aff_ref"
const AFFILIATE_REF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type AffiliateAttribution = {
  affiliateId: string
  affiliateCode: string
  affiliateUserId: string
}

/** Código do cookie de indicação, ainda dentro da janela, já normalizado. Não confere no banco. */
export function readAffiliateRefCookie(request: NextRequest): string | null {
  const raw = request.cookies.get(AFFILIATE_REF_COOKIE)?.value
  if (!raw) return null

  let parsed: { code?: unknown; clickedAt?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed.code !== "string" || typeof parsed.clickedAt !== "number") return null
  if (Date.now() - parsed.clickedAt > AFFILIATE_REF_MAX_AGE_MS) return null
  // O proxy grava o `?ref=` como veio; `affiliates.code` é maiúsculo e a
  // comparação no Postgres é case-sensitive.
  return normalizeAffiliateCode(parsed.code) || null
}

/**
 * Resolve um código para um afiliado que pode receber esta venda: aprovado,
 * com a conta não banida e que não seja o próprio comprador. Auto-indicação
 * volta `null` em silêncio: a compra segue, só não gera comissão.
 */
export async function resolveAffiliateCode(
  code: string,
  buyerUserId: string | null
): Promise<AffiliateAttribution | null> {
  const normalized = normalizeAffiliateCode(code)
  if (!normalized) return null

  const affiliate = await getAffiliateByCode(normalized)
  if (!affiliate) return null
  if (buyerUserId && affiliate.user_id === buyerUserId) return null

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("account_banned_at")
    .eq("id", affiliate.user_id)
    .maybeSingle()
  if (profile?.account_banned_at) return null

  return {
    affiliateId: affiliate.id,
    affiliateCode: normalized,
    affiliateUserId: affiliate.user_id,
  }
}
