import { NextResponse } from "next/server"

import { verifyReferralFromIdentities } from "@/lib/server/referral-verification"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

/**
 * POST /api/indicacoes/verificar-identidade
 *
 * Chamada depois de vincular uma conta Google/Discord em /conta#conexoes.
 * Tenta validar a indicação pendente pelo caminho `oauth_identity`.
 *
 * SEGURANÇA: o corpo da requisição é ignorado de propósito. As identidades
 * são lidas do TOKEN DE SESSÃO no servidor (`auth.getUser`), nunca do que o
 * cliente afirma ter vinculado — senão bastaria um POST com um `provider_id`
 * inventado para validar indicações sem vincular conta nenhuma, e todo o
 * verificador viraria decoração.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
  }

  await verifyReferralFromIdentities(
    data.user.id,
    // `identity.id` é o id da conta no provedor (o `sub`), não
    // `identity_id` (uuid do vínculo, novo a cada vinculação). Ver a nota em
    // app/auth/callback/route.ts: trocar um pelo outro anula o `unique`.
    (data.user.identities ?? []).map((identity) => ({
      provider: identity.provider,
      id: identity.id,
    }))
  )

  return NextResponse.json({ ok: true })
}
