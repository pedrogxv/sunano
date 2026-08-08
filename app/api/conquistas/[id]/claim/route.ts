import { NextRequest, NextResponse } from "next/server"

import { claimEventManually } from "@/lib/server/repositories/events-repository"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ERROR_MESSAGES: Record<"not_found" | "not_manual" | "unavailable" | "insufficient_aura", string> = {
  not_found: "Conquista não encontrada.",
  not_manual: "Essa conquista é concedida automaticamente, não precisa resgatar.",
  unavailable: "As vagas acabaram ou a conquista foi encerrada.",
  insufficient_aura: "Saldo de Aura insuficiente.",
}

/**
 * POST /api/conquistas/:id/claim — resgate manual de um evento `manual_opt_in`
 * ou `aura_redeem`.
 *
 * `claimEventManually` chama a mesma `claim_event_medal` usada no
 * cadastro/login (atômica e idempotente, e que também debita Aura pra
 * `aura_redeem`); esta rota só garante que quem chama está autenticado e
 * não está abusando do clique.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Conquista inválida." }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: "Entre na sua conta para resgatar." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "event_claim",
    identifier: `${getClientIdentifier(request)}:${authData.user.id}`,
    maxAttempts: 10,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de tentar novamente." }, { status: 429 })
  }

  const result = await claimEventManually(authData.user.id, id)
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 400
    return NextResponse.json({ error: ERROR_MESSAGES[result.reason] }, { status })
  }

  return NextResponse.json({ ok: true, event: result.event })
}
