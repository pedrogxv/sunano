import { NextResponse } from "next/server"

import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { canUseStoreNow } from "@/lib/server/auth/store-access"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  getAdminProfileSummary,
  getUserProfile,
  getUserVipStatus,
} from "@/lib/server/repositories/users-repository"
import { countMySupportTicketsAwaitingUser, hasAnySupportTicket } from "@/lib/server/repositories/support-repository"
import { hasForumPostsByUser } from "@/lib/server/repositories/forum-repository"
import { getLatestSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"

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
    return NextResponse.json({
      user: null,
      userProfile: null,
      adminProfile: null,
      hasSupportTicket: false,
      supportTicketsAwaitingMe: 0,
      hasForumPost: false,
      accountTier: "common",
      vipExpiresAt: null,
      canUseStore: !isStoreMaintenanceEnabled(),
    })
  }

  // Sessão aal1 com fator verificado: o usuário ainda não concluiu o 2FA.
  // Retorna como anônimo para que o sidebar e outros componentes cliente não
  // exibam dados do perfil antes da autenticação estar completa.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    return NextResponse.json({
      user: null,
      userProfile: null,
      adminProfile: null,
      hasSupportTicket: false,
      supportTicketsAwaitingMe: 0,
      hasForumPost: false,
      accountTier: "common",
      vipExpiresAt: null,
      canUseStore: !isStoreMaintenanceEnabled(),
    })
  }

  const user = { id: authData.user.id, email: authData.user.email ?? null }

  // hasSupportTicket, supportTicketsAwaitingMe e hasForumPost viajam junto com
  // este fetch (já feito uma vez por sessão pelo AuthProvider) pra alimentar o
  // item "Meus Tickets" do dropdown, o indicador amber no sino e a aba "Meus
  // Posts" do fórum sem nenhum request adicional.
  //
  // No caso do fórum isso importa duas vezes: além de economizar a requisição,
  // ela era ENCADEADA (a página só podia perguntar "tenho posts?" depois que a
  // auth resolvesse), então a aba só aparecia após duas idas ao servidor em
  // série — daí a demora visível pra ela surgir.
  const [
    userProfile,
    adminProfile,
    hasSupportTicket,
    supportTicketsAwaitingMe,
    vipStatus,
    hasForumPost,
    subscription,
    canUseStore,
  ] = await Promise.all([
    getUserProfile(user.id),
    getAdminProfileSummary(user.id),
    hasAnySupportTicket(user.id),
    countMySupportTicketsAwaitingUser(user.id),
    getUserVipStatus(user.id),
    hasForumPostsByUser(user.id),
    // Entra no mesmo Promise.all de propósito: a sidebar precisa distinguir
    // "nunca assinou" (→ "Vire VIP") de "cancelou e ainda tem período pago"
    // (→ "Renovar VIP"), e um fetch encadeado só pra isso atrasaria a
    // resolução da auth em toda página.
    getLatestSubscriptionForUser(user.id).catch(() => null),
    // Loja/Afiliados abertos para ESTE usuário — resolvido no servidor porque
    // a env de manutenção não existe no browser e a liberação individual mora
    // no banco. Entra no mesmo Promise.all para não encadear mais um round-trip.
    canUseStoreNow().catch(() => false),
  ])

  return NextResponse.json({
    user,
    userProfile,
    adminProfile,
    hasSupportTicket,
    supportTicketsAwaitingMe,
    hasForumPost,
    accountTier: vipStatus?.account_tier ?? "common",
    vipExpiresAt: vipStatus?.vip_expires_at ?? null,
    subscriptionStatus: subscription?.status ?? null,
    canUseStore,
  })
}
