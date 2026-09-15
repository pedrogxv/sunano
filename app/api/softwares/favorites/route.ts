import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getFavoriteSoftwareLimit } from "@/lib/account-tier"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { requireVipUser } from "@/lib/server/require-vip-user"
import {
  getFavoriteSoftwaresState,
  reorderFavoriteSoftwares,
} from "@/lib/server/repositories/softwares-repository"
import type { SoftwareFavoritesState } from "@/lib/softwares"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const reorderSchema = z.object({
  ids: z.array(z.uuid("Software inválido.")).max(50, "Lista de favoritos grande demais."),
})

/**
 * GET /api/softwares/favorites: favoritos de quem está logado. Deslogado
 * recebe estado vazio (200), não 401: a página só usa isto para pintar os
 * corações.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    const anonymous: SoftwareFavoritesState = {
      authenticated: false,
      isVip: false,
      ids: [],
      limit: getFavoriteSoftwareLimit("common"),
      canReorder: false,
    }
    return NextResponse.json(anonymous)
  }

  return NextResponse.json(await getFavoriteSoftwaresState(user.id))
}

/** PATCH /api/softwares/favorites: nova ordem dos favoritos. Exclusivo VIP. */
export async function PATCH(request: NextRequest) {
  const vip = await requireVipUser(request)
  if (vip.error) return vip.error

  const rateLimit = await checkRateLimit({
    action: "software_favorite",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de tentar novamente." }, { status: 429 })
  }

  const parsed = reorderSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const result = await reorderFavoriteSoftwares(vip.userId, parsed.data.ids)
    if (result === "mismatch") {
      return NextResponse.json(
        { error: "Seus favoritos mudaram em outra aba. Recarregue a página e tente de novo." },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar a ordem." }, { status: 500 })
  }
}
