import { NextResponse } from "next/server"

import { serializeMentionIndex } from "@/lib/peripheral-mentions"
import { getMentionIndex } from "@/lib/server/repositories/forum-peripherals-repository"

/**
 * Índice de detecção de periféricos para o formulário do fórum.
 *
 * O cliente baixa uma vez e detecta as citações localmente enquanto o usuário
 * digita — sem uma query por tecla. São ~1.100 frases, 69 KB crus e **~20 KB
 * gzipados** (o Next comprime a resposta), e uma detecção custa ~0,2 ms.
 *
 * Frases ambíguas (`rs6 ultra`, que é teclado ATK *e* mouse Attack Shark) são
 * removidas na serialização: elas nunca vinculam, então não há motivo para
 * trafegá-las.
 *
 * Custo de banco: nenhum por request. `getMentionIndex` se apoia em
 * `listAllPeripherals`, que já é `unstable_cache` de 2 min compartilhado com a
 * tierlist e o ranking.
 */
export async function GET() {
  try {
    const index = await getMentionIndex()
    return NextResponse.json(serializeMentionIndex(index), {
      headers: {
        // O catálogo muda com pouca frequência e uma menção perdida só some
        // até a próxima revalidação — o servidor re-detecta ao publicar de
        // qualquer forma, então o índice do cliente nunca é a última palavra.
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    })
  } catch (error) {
    console.error("[perifericos/mention-index]", error)
    // Índice vazio degrada para "nenhuma sugestão", sem quebrar o formulário.
    return NextResponse.json({ p: [] }, { headers: { "Cache-Control": "no-store" } })
  }
}
