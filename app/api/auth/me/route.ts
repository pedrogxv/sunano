import { NextResponse } from "next/server"

import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  getAdminProfileSummary,
  getUserProfile,
} from "@/lib/server/repositories/users-repository"
import { countMySupportTicketsAwaitingUser, hasAnySupportTicket } from "@/lib/server/repositories/support-repository"

export const dynamic = "force-dynamic"

/**
 * Sessão atual + perfis associados.
 *
 * Os componentes cliente usam este endpoint para descobrir quem está logado.
 * Retorna `user: null` se o segundo fator ainda não foi concluído — o frontend
 * trata o usuário como anônimo até a sessão chegar a aal2.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return NextResponse.json({ user: null, userProfile: null, adminProfile: null, hasSupportTicket: false, supportTicketsAwaitingMe: 0 })
  }

  // Sessão aal1 com fator verificado: o usuário ainda não concluiu o 2FA.
  // Retorna como anônimo para que o sidebar e outros componentes cliente não
  // exibam dados do perfil antes da autenticação estar completa.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    return NextResponse.json({ user: null, userProfile: null, adminProfile: null, hasSupportTicket: false, supportTicketsAwaitingMe: 0 })
  }

  const user = { id: authData.user.id, email: authData.user.email ?? null }

  // hasSupportTicket e supportTicketsAwaitingMe viajam junto com este fetch
  // (já feito uma vez por sessão pelo AuthProvider) pra alimentar o item
  // "Meus Tickets" do dropdown e o indicador amber no sino sem nenhum request
  // adicional.
  const [userProfile, adminProfile, hasSupportTicket, supportTicketsAwaitingMe] = await Promise.all([
    getUserProfile(user.id),
    getAdminProfileSummary(user.id),
    hasAnySupportTicket(user.id),
    countMySupportTicketsAwaitingUser(user.id),
  ])

  return NextResponse.json({ user, userProfile, adminProfile, hasSupportTicket, supportTicketsAwaitingMe })
}
