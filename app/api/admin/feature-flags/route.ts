import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { FEATURE_FLAG_MODES, isFeatureFlagKey } from "@/lib/feature-flags"
import { requireWebMaster } from "@/lib/server/auth/admin-auth"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  getAdminFeatureFlagsData,
  saveFeatureFlag,
} from "@/lib/server/repositories/feature-flags-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "private, no-store" }

/** Estado de todas as flags registradas + histórico de mudanças. Só WEB MASTER. */
export async function GET() {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    return NextResponse.json(await getAdminFeatureFlagsData(), { headers: NO_STORE })
  } catch (error) {
    console.error("[api/admin/feature-flags] GET:", error)
    return NextResponse.json({ error: "Não foi possível carregar as flags." }, { status: 500 })
  }
}

const patchSchema = z.object({
  key: z.string().refine(isFeatureFlagKey, "Flag desconhecida."),
  mode: z.enum(FEATURE_FLAG_MODES),
  rolloutPercent: z.number().int().min(0).max(100),
  allowUserIds: z.array(z.string().uuid()).max(200),
  note: z
    .string()
    .trim()
    .max(280, "Nota muito longa (máx. 280).")
    .nullish()
    .transform((value) => value || null),
})

/** Grava o estado de UMA flag. O histórico sai do trigger do banco. */
export async function PATCH(request: NextRequest) {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const rateLimit = await checkRateLimit({
    action: "admin_feature_flags",
    identifier: `user:${guard.profile.id}`,
    maxAttempts: 30,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas mudanças seguidas. Aguarde um instante." }, { status: 429 })
  }

  const { key, ...update } = parsed.data
  if (!isFeatureFlagKey(key)) return NextResponse.json({ error: "Flag desconhecida." }, { status: 400 })

  try {
    await saveFeatureFlag(key, update, guard.profile.id)
    return NextResponse.json(await getAdminFeatureFlagsData(), { headers: NO_STORE })
  } catch (error) {
    console.error("[api/admin/feature-flags] PATCH:", error)
    return NextResponse.json({ error: "Não foi possível salvar a flag." }, { status: 500 })
  }
}
