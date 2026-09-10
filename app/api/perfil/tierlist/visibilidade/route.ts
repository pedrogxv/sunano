import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { setUserTierlistHidden } from "@/lib/server/repositories/user-tierlist-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const schema = z.object({ hidden: z.boolean() })

/**
 * PUT /api/perfil/tierlist/visibilidade — o dono oculta ou revela a própria
 * tierlist pessoal.
 *
 * Diferente das outras rotas de tierlist, esta NÃO exige VIP: montar a
 * tierlist é exclusivo de VIP, mas quem deixou o VIP expirar precisa poder
 * tirar a tierlist (que ficou congelada e pública) do ar. Basta ser o dono
 * logado.
 */
export async function PUT(request: NextRequest) {
  const rateLimit = await checkRateLimit({
    action: "tierlist_visibility",
    identifier: getClientIdentifier(request),
    maxAttempts: 20,
    windowSeconds: 600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  try {
    await setUserTierlistHidden(user.id, parsed.data.hidden)
    return NextResponse.json({ ok: true, hidden: parsed.data.hidden })
  } catch (err) {
    console.error("[perfil/tierlist/visibilidade] save:", err)
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 })
  }
}
