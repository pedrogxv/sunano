import { NextRequest, NextResponse } from "next/server"

import { getFavoriteSoftwareLimit } from "@/lib/account-tier"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import {
  addFavoriteSoftware,
  removeFavoriteSoftware,
  softwareExists,
} from "@/lib/server/repositories/softwares-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Guarded =
  | { userId: string; softwareId: string; error?: undefined }
  | { error: NextResponse; userId?: undefined; softwareId?: undefined }

async function guard(request: NextRequest, params: Promise<{ id: string }>): Promise<Guarded> {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return { error: NextResponse.json({ error: "Software inválido." }, { status: 400 }) }
  }

  const user = await getRequestUser(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) }
  }

  const rateLimit = await checkRateLimit({
    action: "software_favorite",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return { error: NextResponse.json({ error: "Aguarde um pouco antes de tentar novamente." }, { status: 429 }) }
  }

  return { userId: user.id, softwareId: id }
}

/**
 * POST /api/softwares/:id/favorite: favorita um software. O limite do tier é
 * reaplicado aqui (e travado na RPC), nunca confiado ao estado do cliente.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await guard(request, params)
  if (guarded.error) return guarded.error

  if (!(await softwareExists(guarded.softwareId))) {
    return NextResponse.json({ error: "Software não encontrado." }, { status: 404 })
  }

  try {
    const { result, tier, limit } = await addFavoriteSoftware(guarded.userId, guarded.softwareId)
    if (result === "limit_reached") {
      const error =
        tier === "vip"
          ? `Você já tem ${limit} softwares favoritos. Remova um para favoritar outro.`
          : `Contas comuns favoritam até ${limit} softwares. Remova um ou seja VIP para favoritar até ${getFavoriteSoftwareLimit("vip")}.`
      return NextResponse.json({ error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, favorited: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível favoritar agora." }, { status: 500 })
  }
}

/** DELETE /api/softwares/:id/favorite: remove dos favoritos. Idempotente. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await guard(request, params)
  if (guarded.error) return guarded.error

  try {
    await removeFavoriteSoftware(guarded.userId, guarded.softwareId)
    return NextResponse.json({ ok: true, favorited: false })
  } catch {
    return NextResponse.json({ error: "Não foi possível remover agora." }, { status: 500 })
  }
}
