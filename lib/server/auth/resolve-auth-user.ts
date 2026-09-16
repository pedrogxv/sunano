import "server-only"

import { cache } from "react"

import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
import { canUseStoreNow } from "@/lib/server/auth/store-access"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  getAdminProfileSummary,
  getUserProfileWithVipStatus,
} from "@/lib/server/repositories/users-repository"
import {
  countMySupportTicketsAwaitingUser,
  hasAnySupportTicket,
} from "@/lib/server/repositories/support-repository"
import { hasForumPostsByUser } from "@/lib/server/repositories/forum-repository"
import { ownsVipFounderFrame } from "@/lib/server/repositories/vip-founder-repository"
import { getUserStreakPairsByUser } from "@/lib/server/repositories/achievements-repository"
import { getLatestSubscriptionForUser } from "@/lib/server/repositories/vip-subscription-repository"

/**
 * Payload de sessão que o cliente consome — o MESMO formato devolvido por
 * `/api/auth/me`.
 *
 * O tipo mora aqui, e não no route handler, porque agora existem DOIS
 * produtores do mesmo payload (este módulo, no render do servidor, e o
 * endpoint, para as reconsultas do client). Eles não podem divergir: o
 * endpoint apenas serializa o que esta função devolve. Ver
 * app/api/auth/me/route.ts.
 */
export type AuthUserPayload = {
  user: { id: string; email: string | null } | null
  userProfile: { display_name?: string | null; avatar_url?: string | null } | null
  adminProfile: {
    email?: string | null
    display_name?: string | null
    avatar_url?: string | null
    role?: string | null
  } | null
  hasSupportTicket: boolean
  supportTicketsAwaitingMe: number
  hasForumPost: boolean
  accountTier: string | null
  vipExpiresAt: string | null
  subscriptionStatus: string | null
  canUseStore: boolean
  /** Asset da moldura de avatar equipada — a topbar desenha a mesma moldura do resto do site. */
  equippedFrameUrl: string | null
  /** Slug do mesmo item (ver `lib/profile-frames.ts`). */
  equippedFrameSlug: string | null
  /**
   * Se possui a Moldura de Fundador. Honraria permanente (vale sem VIP
   * ativo), então não dá para derivar de `accountTier` — precisa vir do
   * banco junto com o resto da sessão, senão a topbar desenharia a moldura
   * de VIP comum em cima de um fundador.
   */
  isFounder: boolean
  /**
   * RECORDE de ofensiva — decide a moldura de marco da topbar. Nunca a
   * ofensiva atual: o marco alcançado é permanente.
   */
  longestStreak: number
  /**
   * O dono escolheu não exibir moldura nenhuma. Sem este campo na sessão, a
   * topbar e o preview do editor de perfil voltariam a desenhar a honraria de
   * quem pediu para não ter moldura.
   */
  frameOptOut: boolean
}

/** Resposta para quem não está autenticado (ou ainda não concluiu o 2FA). */
function anonymousPayload(): AuthUserPayload {
  return {
    user: null,
    userProfile: null,
    adminProfile: null,
    hasSupportTicket: false,
    supportTicketsAwaitingMe: 0,
    hasForumPost: false,
    accountTier: "common",
    vipExpiresAt: null,
    subscriptionStatus: null,
    canUseStore: !isStoreMaintenanceEnabled(),
    equippedFrameUrl: null,
    equippedFrameSlug: null,
    isFounder: false,
    longestStreak: 0,
    frameOptOut: false,
  }
}

/**
 * Sessão atual + tudo que a casca da interface (topbar, sidebar, selo VIP)
 * precisa para se pintar CERTA já na primeira renderização.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Antes, o `AuthProvider` nascia com `user: null` e só descobria quem estava
 * logado depois de um `fetch("/api/auth/me")` disparado no `useEffect` do
 * mount. Entre a hidratação e a resposta desse fetch (1–2s: dois round-trips
 * ao Supabase Auth mais oito consultas), a página ficava no estado de
 * deslogado e depois **saltava** — o CTA do VIP trocava de "Seja VIP" para
 * "Reativar assinatura" na frente do usuário. Resolvendo no servidor o HTML
 * já sai com o estado correto e o salto deixa de existir.
 *
 * `cache` do React deduplica por request: layout e qualquer rota que também
 * precise da sessão no mesmo render dividem uma única execução — a carga no
 * banco não aumenta em relação ao fetch único que o provider fazia antes.
 *
 * IMPORTANTE: esta função lê cookies, então é uma Request-time API. NUNCA a
 * chame a partir do layout raiz — isso opta TODA rota do site por renderização
 * dinâmica e mataria o ISR das páginas indexáveis (fórum, blog, notícias,
 * periféricos, loja, que rodam com `revalidate`). Envolver a chamada em
 * `<Suspense>` NÃO evita isso: sem Cache Components, um Suspense não é
 * fronteira de prerendering, e a rota inteira vira dinâmica do mesmo jeito —
 * foi medido. Ver lib/client/auth-snapshot.ts, que explica a abordagem adotada
 * no cliente no lugar disso.
 *
 * Use-a a partir de route handlers (como /api/auth/me) e de páginas que JÁ são
 * dinâmicas por natureza.
 */
export const resolveAuthUser = cache(async function resolveAuthUser(): Promise<AuthUserPayload> {
  const supabase = await createSupabaseServerClient()

  // As duas em PARALELO. Eram sequenciais, e como cada uma é um round-trip ao
  // Supabase Auth, uma esperava a outra sem precisar: `getUser` valida o token
  // e `getAuthenticatorAssuranceLevel` apenas o decodifica, então não há
  // dependência real entre elas. O resultado da primeira continua sendo
  // conferido antes de qualquer uso do segundo.
  const [{ data: authData }, { data: aal }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  if (!authData.user) return anonymousPayload()

  // Sessão aal1 com fator verificado: o 2FA ainda não foi concluído. Trata
  // como anônimo para que a casca não exiba dados do perfil antes da
  // autenticação estar completa.
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    return anonymousPayload()
  }

  const user = { id: authData.user.id, email: authData.user.email ?? null }

  // Tudo em paralelo: encadear qualquer uma destas devolveria ao caminho
  // crítico o round-trip que esta mudança inteira existe para eliminar.
  const [
    profileAndVip,
    adminProfile,
    hasSupportTicket,
    supportTicketsAwaitingMe,
    hasForumPost,
    subscription,
    canUseStore,
    isFounder,
    streaks,
  ] = await Promise.all([
    // Perfil e status do VIP numa consulta só: são a mesma linha da mesma
    // tabela, e antes custavam dois round-trips ao banco por visita.
    getUserProfileWithVipStatus(user.id),
    getAdminProfileSummary(user.id),
    hasAnySupportTicket(user.id),
    countMySupportTicketsAwaitingUser(user.id),
    hasForumPostsByUser(user.id),
    // `resolveVipStatus` (lib/vip-status.ts) precisa do status da assinatura
    // para distinguir "nunca assinou" de "cancelou com período pago correndo"
    // — estados que levam a CTAs opostos ("Seja VIP", que cobra, vs.
    // "Reativar assinatura", que não).
    getLatestSubscriptionForUser(user.id).catch(() => null),
    // Loja/Afiliados abertos para ESTE usuário: resolvido no servidor porque a
    // env de manutenção não existe no browser e a liberação individual mora no
    // banco.
    canUseStoreNow().catch(() => false),
    // Posse da Moldura de Fundador: honraria permanente, não derivável do
    // tier (ver `AuthUserPayload.isFounder`). Entra no mesmo `Promise.all`
    // para não devolver ao caminho crítico o round-trip extra.
    ownsVipFounderFrame(user.id).catch(() => false),
    // Recorde de ofensiva, pelo mesmo motivo do Fundador: a moldura de marco
    // é permanente e a topbar precisa desenhar a MESMA que o resto do site.
    getUserStreakPairsByUser([user.id]).catch(
      () => ({}) as Awaited<ReturnType<typeof getUserStreakPairsByUser>>
    ),
  ])

  return {
    user,
    userProfile: profileAndVip.profile,
    adminProfile,
    hasSupportTicket,
    supportTicketsAwaitingMe,
    hasForumPost,
    accountTier: profileAndVip.vip?.account_tier ?? "common",
    vipExpiresAt: profileAndVip.vip?.vip_expires_at ?? null,
    subscriptionStatus: subscription?.status ?? null,
    canUseStore,
    equippedFrameUrl: profileAndVip.equippedFrame?.frameAssetUrl ?? null,
    equippedFrameSlug: profileAndVip.equippedFrame?.slug ?? null,
    isFounder,
    longestStreak: streaks[user.id]?.longest ?? 0,
    frameOptOut: profileAndVip.frameOptOut,
  }
})
