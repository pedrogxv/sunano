import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { setTierlistHeart } from "@/lib/server/repositories/user-tierlist-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  ownerId: z.string().uuid(),
})

/**
 * POST/DELETE /api/perfil/tierlist/coracao — dar/tirar coração na tierlist de
 * outra pessoa.
 *
 * Não é gated por VIP de propósito: VIP é montar a tierlist, reagir à dos
 * outros é de qualquer membro logado — mesmo espírito do like de periférico.
 */
async function toggleHeart(request: NextRequest, hearted: boolean) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })

  const rawBody = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: "Tierlist inválida." }, { status: 400 })
  }

  const { ownerId } = parsed.data
  if (ownerId === user.id) {
    return NextResponse.json({ error: "Você não pode curtir a própria tierlist." }, { status: 400 })
  }

  const rateLimit = await checkRateLimit({
    action: "tierlist_heart",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de curtir novamente." }, { status: 429 })
  }

  try {
    const heartsCount = await setTierlistHeart(ownerId, user.id, hearted)
    return NextResponse.json({ ok: true, hearted, heartsCount })
  } catch (err) {
    console.error("[perfil/tierlist/coracao] toggle:", err)
    return NextResponse.json({ error: "Não foi possível registrar o coração." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return toggleHeart(request, true)
}

export async function DELETE(request: NextRequest) {
  return toggleHeart(request, false)
}
