import "server-only"

import type { NextRequest } from "next/server"

import { IMPERSONATION_ORIGIN_COOKIE } from "@/lib/impersonation-shared"
import { createSupabaseRouteClient } from "@/lib/server/supabase/route-client"

export type SessionUser = {
  id: string
  email: string | null
}

/**
 * Resolve o usuário autenticado a partir dos cookies da requisição.
 * Retorna `null` quando não há sessão válida.
 */
export async function getRequestUser(request: NextRequest): Promise<SessionUser | null> {
  const supabase = createSupabaseRouteClient(request)
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

/**
 * Sessão "logado como usuário" (impersonation) ativa nesta requisição?
 *
 * O escopo de uma sessão impersonada é SOMENTE LEITURA (LGPD Art. 6º, III —
 * ver lib/server/impersonation.ts), e hoje isso é imposto em um único ponto:
 * o proxy recusa todo método != GET/HEAD sob `/api` (proxy.ts). Funciona,
 * mas é uma trava só — uma mudança de matcher, uma rota fora de `/api` ou a
 * introdução de Server Actions reabriria escrita sob sessão impersonada sem
 * nenhum sinal.
 *
 * Esta função é a segunda trava, para as rotas que MOVIMENTAM DINHEIRO OU
 * ESTOQUE chamarem por conta própria: comprar, cancelar e mudar endereço de
 * entrega em nome de outra pessoa é exatamente o que a sessão de suporte
 * nunca pode fazer, mesmo que a primeira trava falhe.
 *
 * Só detecta a presença do cookie assinado — não o valida nem o decodifica.
 * É de propósito: `lib/server/impersonation.ts` usa `next/headers` e o
 * segredo do service role, e para "negar escrita" a presença basta. Um
 * cookie forjado sem assinatura válida não concede nada; no máximo faz quem
 * o enviou perder o próprio acesso de escrita.
 */
export function isImpersonating(request: NextRequest): boolean {
  return Boolean(request.cookies.get(IMPERSONATION_ORIGIN_COOKIE)?.value)
}
