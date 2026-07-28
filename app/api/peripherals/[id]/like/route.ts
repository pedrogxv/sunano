import { NextRequest, NextResponse } from "next/server"

import { getFavoriteLimit } from "@/lib/account-tier"
import { peripheralsExist } from "@/lib/server/repositories/peripherals-repository"
import {
  addFavorite,
  getAccountTier,
  removeFavorite,
} from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST/DELETE /api/peripherals/:id/like — curtir/descurtir um periférico.
 *
 * Grava na mesma `user_favorite_peripherals` usada pela vitrine do perfil
 * (`replaceFavorites` em `/api/profile/showcase`): curtir aqui é o que
 * alimenta "Periféricos favoritos" em `/perfil`. O limite por tier é
 * reaplicado nesta rota porque a fronteira da API não confia no estado
 * otimista do cliente.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Periférico inválido." }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
  }
  const userId = authData.user.id

  const exists = await peripheralsExist([id])
  if (!exists) {
    return NextResponse.json({ error: "Periférico não encontrado." }, { status: 404 })
  }

  const limit = getFavoriteLimit(await getAccountTier(userId))
  const result = await addFavorite(userId, id, limit)

  if (result === "limit_reached") {
    return NextResponse.json(
      {
        error: `Seu plano permite no máximo ${limit} periféricos favoritos. Remova um para curtir outro.`,
      },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, liked: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Periférico inválido." }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
  }

  await removeFavorite(authData.user.id, id)
  return NextResponse.json({ ok: true, liked: false })
}
