import type { StoreProductAttributes } from "@/lib/store-catalog"

/**
 * "Você também pode gostar" da página de produto. Módulo puro: o repositório
 * (`listProductRecommendations`) junta os sinais do banco e decide aqui.
 *
 * Quatro sinais, em ordem de peso:
 *
 * 1. **Comprados juntos** — pedidos pagos que levaram este produto e o
 *    candidato. É o único sinal que vem de comportamento real; com a Loja
 *    nova ele é raro, por isso tem teto e os outros seguram a lista.
 * 2. **Complemento** — quem olha um mouse precisa de mousepad e feet, quem
 *    olha um teclado precisa de switch. Categoria vizinha, não a mesma.
 * 3. **Alternativa** — mesma categoria, parecida no que importa para a
 *    escolha (formato e tamanho no mouse, layout no teclado, superfície no
 *    mousepad) e numa faixa de preço próxima. Alternativa de R$ 1.200 para
 *    um mouse de R$ 300 não é alternativa.
 * 4. **Vitrine** — mais vendido, bem avaliado, em promoção: desempate.
 *
 * No fim a lista é diversificada: a mesma categoria perde força a cada card
 * repetido, senão um teclado recomendaria 12 teclados e nenhum switch.
 */

export type RecommendationCandidate = {
  id: string
  name: string
  category: string | null
  brand: string | null
  priceCents: number
  attributes: StoreProductAttributes
  /** Pedidos pagos que levaram este candidato junto do produto aberto. */
  boughtTogether: number
  isBestSeller: boolean
  rating: { average: number; count: number } | null
  onPromo: boolean
  isFeatured: boolean
}

export type RecommendationTarget = {
  id: string
  name: string
  category: string | null
  brand: string | null
  priceCents: number
  attributes: StoreProductAttributes
}

/**
 * Categorias que completam a compra, pelo `value` do admin (ver
 * `STORE_CATEGORY_LABELS`). A ordem não pesa; o peso é o mesmo para todas.
 */
const COMPLEMENTS: Record<string, string[]> = {
  mouse: ["mousepad", "glasspad", "feet", "acessorio"],
  mousepad: ["mouse", "feet", "glasspad"],
  glasspad: ["mouse", "feet", "mousepad"],
  feet: ["mouse", "mousepad", "glasspad"],
  keyboard: ["switches", "acessorio", "mouse"],
  switches: ["keyboard"],
  iem: ["dac_amp", "acessorio"],
  headset: ["dac_amp", "acessorio"],
  dac_amp: ["iem", "headset"],
  acessorio: ["mouse", "keyboard", "mousepad"],
  combos: ["mousepad", "feet", "acessorio"],
}

/** Categorias que não se oferecem para quem está olhando um produto físico. */
const NEVER_RECOMMENDED = new Set(["services"])

const W = {
  boughtTogetherPerOrder: 8,
  boughtTogetherCap: 32,
  complement: 20,
  sameCategory: 12,
  sameBrand: 3,
  attributeMatch: 3,
  sharedTag: 1.5,
  sharedTagCap: 4.5,
  priceClose: 7,
  priceNear: 3,
  priceFar: -8,
  bestSeller: 4,
  wellRated: 3,
  promo: 2,
  featured: 1.5,
} as const

/** Atributos que decidem a escolha dentro da categoria. */
const SIMILARITY_KEYS = [
  "shape",
  "size",
  "connection",
  "keyboardType",
  "layout",
  "padSurface",
  "padBase",
] as const satisfies readonly (keyof StoreProductAttributes)[]

function normalizedName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(usado|novo|aberto|open ?box|seminovo)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function priceScore(target: number, candidate: number, sameCategory: boolean): number {
  if (target <= 0 || candidate <= 0) return 0
  const ratio = candidate / target
  if (ratio >= 0.7 && ratio <= 1.35) return W.priceClose
  if (ratio >= 0.45 && ratio <= 1.8) return W.priceNear
  // Complemento caro demais (mousepad de R$ 900 para mouse de R$ 150) é
  // tão fora quanto alternativa cara demais; barato nunca atrapalha.
  return ratio > (sameCategory ? 1.8 : 2.5) ? W.priceFar : 0
}

function similarityScore(a: StoreProductAttributes, b: StoreProductAttributes): number {
  let score = 0
  for (const key of SIMILARITY_KEYS) {
    if (a[key] && a[key] === b[key]) score += W.attributeMatch
  }
  if (a.weightGrams != null && b.weightGrams != null && Math.abs(a.weightGrams - b.weightGrams) <= 8) {
    score += W.attributeMatch
  }
  const tags = a.tags.filter((tag) => b.tags.includes(tag)).length
  return score + Math.min(W.sharedTagCap, tags * W.sharedTag)
}

export function scoreRecommendation(target: RecommendationTarget, candidate: RecommendationCandidate): number {
  const sameCategory = Boolean(target.category && target.category === candidate.category)
  const complement = Boolean(
    target.category && candidate.category && COMPLEMENTS[target.category]?.includes(candidate.category)
  )

  let score = Math.min(W.boughtTogetherCap, candidate.boughtTogether * W.boughtTogetherPerOrder)
  if (complement) score += W.complement
  if (sameCategory) score += W.sameCategory + similarityScore(target.attributes, candidate.attributes)
  if (target.brand && candidate.brand && target.brand.toLowerCase() === candidate.brand.toLowerCase()) {
    score += W.sameBrand
  }
  if (sameCategory || complement) score += priceScore(target.priceCents, candidate.priceCents, sameCategory)

  if (candidate.isBestSeller) score += W.bestSeller
  if (candidate.rating && candidate.rating.count >= 1 && candidate.rating.average >= 4.5) score += W.wellRated
  if (candidate.onPromo) score += W.promo
  if (candidate.isFeatured) score += W.featured
  return score
}

/**
 * Ids recomendados, na ordem de exibição. Candidato sem relação nenhuma
 * (nem categoria, nem compra conjunta) só entra para completar a lista, e
 * pela vitrine — melhor um mais vendido do que um trilho de 2 cards.
 */
export function pickRecommendations(
  target: RecommendationTarget,
  candidates: readonly RecommendationCandidate[],
  limit: number
): string[] {
  const targetName = normalizedName(target.name)
  const scored = candidates
    .filter((c) => c.id !== target.id)
    .filter((c) => !c.category || !NEVER_RECOMMENDED.has(c.category) || c.category === target.category)
    // O mesmo produto em outra condição (novo/usado) não é recomendação: é
    // o que a pessoa já está vendo.
    .filter((c) => normalizedName(c.name) !== targetName)
    .map((c) => ({ id: c.id, category: c.category ?? "", score: Math.max(0, scoreRecommendation(target, c)) }))
    .sort((a, b) => b.score - a.score)

  const picked: string[] = []
  const perCategory = new Map<string, number>()
  const pool = [...scored]
  while (picked.length < limit && pool.length > 0) {
    // Cada card repetido da mesma categoria custa 25% da nota dos próximos.
    let bestIndex = 0
    let bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const entry = pool[i]
      const adjusted = entry.score * Math.pow(0.75, perCategory.get(entry.category) ?? 0)
      if (adjusted > bestScore) {
        bestScore = adjusted
        bestIndex = i
      }
    }
    const [chosen] = pool.splice(bestIndex, 1)
    picked.push(chosen.id)
    perCategory.set(chosen.category, (perCategory.get(chosen.category) ?? 0) + 1)
  }
  return picked
}
