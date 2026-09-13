import { NextResponse } from "next/server"

import { listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"

/**
 * Catálogo enxuto para o formulário do fórum: o índice de menções resolve
 * texto -> id, mas o chip precisa de nome, marca, categoria e tier.
 *
 * Separado do `/mention-index` de propósito — o índice é puro texto e comprime
 * muito bem. Manter os dois apartados deixa o índice pequeno e permite cachear
 * cada um no seu próprio ritmo.
 *
 * ## Sem `image_url` — de propósito
 *
 * Medido: com as URLs de imagem a resposta era 35,8 KB gzip; sem elas, 20,4 KB.
 * Os ~15 KB de diferença são hash aleatório de nome de arquivo, que não
 * comprime (tentar fatorar o prefixo comum do Storage não adiantou: o gzip já
 * eliminava a repetição sozinho, 37,6 -> 37,1 KB).
 *
 * E são 15 KB para nada: o formulário mostra imagem só dos periféricos que o
 * usuário de fato citou — tipicamente um ou dois, nunca os 576. A imagem de
 * quem entra num chip é buscada sob demanda em `/api/perifericos/[id]/thumb`.
 *
 * Sem custo de banco por request: `listAllPeripherals` é `unstable_cache` de
 * 2 min, o mesmo full-scan já usado pela tierlist e pelo ranking.
 */
export async function GET() {
  try {
    const peripherals = await listAllPeripherals()
    const items = peripherals.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      tier: p.tier,
    }))

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    )
  } catch (error) {
    console.error("[perifericos/mention-catalog]", error)
    return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } })
  }
}
