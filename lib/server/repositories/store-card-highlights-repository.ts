import "server-only"

import { getStoreCatalogIndex } from "@/lib/server/repositories/store-catalog-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { deriveCardHighlights, sanitizeCardHighlights } from "@/lib/store-card"
import type { CardHighlightVocabulary, CardHighlightOption } from "@/lib/store-card"

/**
 * Vocabulário das características do card, para o seletor do admin. Não há
 * tabela própria: a fonte é o que a vitrine JÁ mostra, ou seja,
 * `store_products.card_highlights` (escolha manual) mais o que
 * `deriveCardHighlights` gera do Database. Uma lista à parte divergiria
 * das duas na primeira característica criada fora dela, e o seletor
 * passaria a oferecer termos que nenhum card usa.
 *
 * "Criar" no seletor, portanto, é só usar um termo novo: ele entra no
 * vocabulário quando o produto é salvo.
 */
export async function getCardHighlightVocabulary(productId: string | null): Promise<CardHighlightVocabulary> {
  const db = createSupabaseAdminClient()
  const [{ data, error }, catalog] = await Promise.all([
    db.from("store_products").select("id, card_highlights").eq("type", "store"),
    getStoreCatalogIndex(),
  ])
  if (error) console.error("[store-card-highlights-repository] getCardHighlightVocabulary:", error)

  // Chave em minúsculas, igual ao dedupe de `sanitizeCardHighlights`: "8k" e
  // "8K" são a mesma característica. Vale a grafia do primeiro que apareceu.
  const byKey = new Map<string, CardHighlightOption>()
  function count(label: string, source: "manual" | "auto") {
    const key = label.toLowerCase()
    const option = byKey.get(key) ?? { label, manualUses: 0, autoUses: 0 }
    if (source === "manual") option.manualUses += 1
    else option.autoUses += 1
    byKey.set(key, option)
  }

  const manualIds = new Set<string>()
  for (const row of data ?? []) {
    const manual = sanitizeCardHighlights(Array.isArray(row.card_highlights) ? row.card_highlights : [])
    if (manual.length > 0) manualIds.add(row.id)
    for (const label of manual) count(label, "manual")
  }
  // O automático só conta para quem NÃO escolheu à mão: é o que o card dele
  // mostra de fato (ver `withCardDisplay`).
  for (const [id, entry] of Object.entries(catalog)) {
    if (manualIds.has(id)) continue
    for (const label of deriveCardHighlights(entry.category, entry.attributes)) count(label, "auto")
  }

  const entry = productId ? catalog[productId] : undefined
  return {
    options: [...byKey.values()].sort(
      (a, b) => b.manualUses + b.autoUses - (a.manualUses + a.autoUses) || a.label.localeCompare(b.label, "pt-BR")
    ),
    suggested: entry ? deriveCardHighlights(entry.category, entry.attributes) : [],
  }
}
