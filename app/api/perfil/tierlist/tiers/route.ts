import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { requireVipUser } from "@/lib/server/require-vip-user"
import {
  replaceUserTierlistTiers,
  TierlistTierInUseError,
} from "@/lib/server/repositories/user-tierlist-repository"
import {
  TIERLIST_MAX_TIERS,
  TIERLIST_MIN_TIERS,
  TIERLIST_TIER_LABEL_MAX_LENGTH,
} from "@/lib/personal-tierlist"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const tierInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(TIERLIST_TIER_LABEL_MAX_LENGTH),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

const replaceSchema = z.object({
  tiers: z.array(tierInputSchema).min(TIERLIST_MIN_TIERS).max(TIERLIST_MAX_TIERS),
})

/** PUT — substitui o conjunto inteiro de tiers do usuário (renomear/recolorir/reordenar/adicionar/remover). */
export async function PUT(request: NextRequest) {
  const auth = await requireVipUser(request)
  if (auth.error) return auth.error

  const rawBody = await request.json().catch(() => null)
  const parsed = replaceSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const tiers = await replaceUserTierlistTiers(auth.userId, parsed.data.tiers)
    return NextResponse.json({ tiers })
  } catch (err) {
    if (err instanceof TierlistTierInUseError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof Error && /entre \d+ e \d+ tiers|Nome do tier|Cor do tier/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error("[perfil/tierlist/tiers] replace:", err)
    return NextResponse.json({ error: "Não foi possível salvar os tiers." }, { status: 500 })
  }
}
