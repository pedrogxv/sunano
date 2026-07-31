import { NextResponse } from "next/server"
import * as z from "zod"

import { getFavoriteLimit, getMedalLimit } from "@/lib/account-tier"
import {
  getAccountTier,
  getProfileShowcase,
  replaceFavorites,
  setPinnedMedals,
  setSetupItem,
  SETUP_SLOTS,
} from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

// Um slot aponta para um periférico do catálogo ou fica vazio (`null`). Não
// existe texto livre: o setup é vitrine pública e não campo de escrita aberta.
const setupItemSchema = z.object({
  slot: z.enum(SETUP_SLOTS),
  peripheral_id: z.string().uuid().nullable().optional(),
})

// Nome, avatar, banner e bio são editados por `/api/profile`. Aqui ficam
// apenas as coleções da vitrine, que dependem do limite de tier.
const patchSchema = z.object({
  setup: z.array(setupItemSchema).max(SETUP_SLOTS.length).optional(),
  favorites: z.array(z.string().uuid()).max(50).optional(),
  pinned_medals: z.array(z.string().uuid()).max(50).optional(),
})

/**
 * GET /api/profile/showcase        -> perfil público do usuário autenticado
 * GET /api/profile/showcase?userId -> perfil público de qualquer usuário
 */
export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId")

    if (userId) {
      const showcase = await getProfileShowcase(userId)
      if (!showcase) {
        return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 })
      }
      return NextResponse.json({ ok: true, showcase })
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const showcase = await getProfileShowcase(authData.user.id)
    if (!showcase) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ ok: true, showcase })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar perfil." }, { status: 500 })
  }
}

/** PATCH /api/profile/showcase — edita a vitrine do próprio usuário. */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const parsed = patchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const userId = authData.user.id
    const tier = await getAccountTier(userId)
    const { setup, favorites, pinned_medals } = parsed.data

    if (setup) {
      for (const item of setup) {
        await setSetupItem(userId, item.slot, item.peripheral_id ?? null)
      }
    }

    // Os limites de tier são aplicados aqui — a UI também os respeita, mas
    // a fronteira da API não pode confiar no cliente.
    if (favorites) {
      const limit = getFavoriteLimit(tier)
      if (favorites.length > limit) {
        return NextResponse.json(
          { error: `Seu plano permite no máximo ${limit} periféricos favoritos.` },
          { status: 400 }
        )
      }
      await replaceFavorites(userId, favorites)
    }

    if (pinned_medals) {
      const limit = getMedalLimit(tier)
      if (pinned_medals.length > limit) {
        return NextResponse.json(
          { error: `Seu plano permite exibir no máximo ${limit} medalhas.` },
          { status: 400 }
        )
      }
      await setPinnedMedals(userId, pinned_medals)
    }

    const showcase = await getProfileShowcase(userId)
    if (!showcase) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ ok: true, showcase })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar perfil." }, { status: 500 })
  }
}
