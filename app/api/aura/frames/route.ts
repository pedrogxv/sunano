import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getFrameCollection } from "@/lib/server/repositories/frame-collection-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/aura/frames — a coleção de molduras do usuário: o que ele tem, o
 * que pode ter e o que falta para cada uma.
 *
 * Existe para o editor de perfil (`/perfil`), que é uma página client e por
 * isso não pode chamar o repositório direto (ver ARQUITETURA.md). Devolve
 * SEMPRE a coleção inteira, e não só a posse: o valor da tela está justamente
 * em mostrar a moldura que ainda não é sua com o que falta para ela.
 *
 * A arte não viaja no corpo — só o `slug`. Quem desenha é `lib/profile-frames.ts`
 * no cliente, que é onde a arte mora (mesmo modelo dos Fundos de Mini Perfil).
 * Mandar a cor pelo JSON criaria uma segunda fonte para o mesmo desenho.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const collection = await getFrameCollection(user.id)

  return NextResponse.json({
    equippedItemId: collection.equippedItemId,
    frameOptOut: collection.frameOptOut,
    longestStreak: collection.longestStreak,
    ownedCount: collection.ownedCount,
    entries: collection.entries.map((entry) => ({
      itemId: entry.itemId,
      slug: entry.frame.slug,
      owned: entry.owned,
      equipped: entry.equipped,
      lock: entry.lock,
      equippable: entry.equippable,
      progressLabel: entry.progressLabel,
      auraCost: entry.auraCost,
      // Só as cosméticas têm asset; as de código o cliente resolve pelo slug.
      assetUrl: entry.frame.render.kind === "asset" ? entry.frame.render.url : null,
      name: entry.frame.name,
      description: entry.frame.description,
    })),
  })
}
