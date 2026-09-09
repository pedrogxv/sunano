import "server-only"

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isVipActive } from "@/lib/account-tier"

/**
 * Gate compartilhado pelas rotas da tierlist pessoal (itens e tiers):
 * exige sessão + VIP ativo. Defesa em profundidade — a RLS das tabelas já
 * bloqueia não-VIP, isto barra antes de tentar.
 */
export async function requireVipUser(
  request: NextRequest
): Promise<{ userId: string; error?: undefined } | { error: NextResponse; userId?: undefined }> {
  const user = await getRequestUser(request)
  if (!user) return { error: NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 }) }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", user.id)
    .maybeSingle()

  if (!isVipActive(profile?.account_tier, profile?.vip_expires_at)) {
    return { error: NextResponse.json({ error: "Recurso exclusivo VIP." }, { status: 403 }) }
  }

  return { userId: user.id }
}
