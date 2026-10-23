import "server-only"

import type { AccountMilestone, AccountSummary } from "@/lib/account-summary"
import { TRUST_BASE_SCORE, trustLevelOf, type TrustLevel, type TrustStatus } from "@/lib/trust-factor"
import { getUserStreak } from "@/lib/server/repositories/achievements-repository"
import {
  getUserAuraBalance,
  getUserAuraRank,
  getUserAuraTotalEarned,
} from "@/lib/server/repositories/aura-repository"
import { countUserReviews } from "@/lib/server/repositories/peripheral-reviews-repository"
import { countForumActivity } from "@/lib/server/repositories/profile-showcase-repository"
import { getTrustSummary } from "@/lib/server/repositories/trust-repository"
import { countFollowers } from "@/lib/server/repositories/users-repository"
import { ownsVipFounderFrame } from "@/lib/server/repositories/vip-founder-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Retrato da conta do próprio usuário (hero de /conta e /perfil).
 *
 * Reaproveita os contadores do perfil público (`countForumActivity`,
 * `countUserReviews`, `getUserStreak`...) em vez de reescrevê-los: o número
 * que a pessoa vê aqui tem de ser o mesmo que os outros veem no perfil dela.
 *
 * Mais leve que `getProfileShowcase` de propósito — sem setup, favoritos nem
 * reviews: o hero só mostra contagens. Cada parte que falha vira zero/null,
 * nunca um 500 na página da conta (é a tela que cadastra 2FA).
 */
export async function getAccountSummary(userId: string): Promise<AccountSummary | null> {
  const db = createSupabaseAdminClient()

  const { data: profile, error } = await db
    .from("user_profiles")
    .select("created_at, profile_views")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[account-summary-repository] perfil:", error)
    return null
  }
  if (!profile) return null

  const safe = <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch((err) => {
      console.error(`[account-summary-repository] ${label}:`, err)
      return fallback
    })

  const [
    memberNumber,
    trust,
    balance,
    totalEarned,
    rank,
    streak,
    medals,
    followers,
    forum,
    reviews,
    isFounder,
    milestones,
  ] = await Promise.all([
    safe("memberNumber", countMemberNumber(profile.created_at), null),
    // `getTrustSummary` traz a nota; aqui só a faixa, o estado e a trava do
    // físico seguem adiante — a resposta vai para o navegador.
    safe("trust", getTrustSummary(userId), null),
    safe("aura", getUserAuraBalance(userId), 0),
    safe("auraTotal", getUserAuraTotalEarned(userId), 0),
    safe("auraRank", getUserAuraRank(userId), null),
    safe("streak", getUserStreak(userId), null),
    safe("medals", countMedals(userId), 0),
    safe("followers", countFollowers(userId), 0),
    safe("forum", countForumActivity(userId), { posts: 0, comments: 0 }),
    safe("reviews", countUserReviews(userId), 0),
    safe("founder", ownsVipFounderFrame(userId), false),
    safe("milestones", getFirstTimes(userId), []),
  ])

  const joined: AccountMilestone = {
    kind: "joined",
    at: profile.created_at,
    detail: null,
    href: null,
  }

  return {
    memberSince: profile.created_at,
    memberNumber,
    trust: {
      level: (trust?.level as TrustLevel | undefined) ?? trustLevelOf(TRUST_BASE_SCORE),
      status: (trust?.status as TrustStatus | undefined) ?? "active",
      canRedeemPhysical: trust?.canRedeemPhysical ?? false,
    },
    aura: { balance, totalEarned, rank },
    streak: {
      current: streak?.current ?? 0,
      longest: streak?.longest ?? 0,
      frozen: streak?.frozen ?? false,
      frozenUntil: streak?.frozenUntil ?? null,
    },
    medals,
    followers,
    profileViews: profile.profile_views ?? 0,
    contributions: { posts: forum.posts, comments: forum.comments, reviews },
    isFounder,
    milestones: [joined, ...milestones].sort((a, b) => a.at.localeCompare(b.at)),
  }
}

/** Quantas contas existiam até a desta, inclusive — o "Membro nº". */
async function countMemberNumber(createdAt: string): Promise<number | null> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .lte("created_at", createdAt)
  if (error) throw error
  return count ?? null
}

async function countMedals(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("user_medals")
    .select("medal_id", { count: "exact", head: true })
    .eq("user_id", userId)
  if (error) throw error
  return count ?? 0
}

/**
 * A PRIMEIRA vez de cada coisa: post, comentário, review, medalha.
 *
 * Uma linha por consulta (`order` + `limit 1`), não a lista inteira. Conteúdo
 * oculto pela moderação fica de fora, igual aos contadores — senão a jornada
 * apontaria para um post que já não abre.
 */
async function getFirstTimes(userId: string): Promise<AccountMilestone[]> {
  const db = createSupabaseAdminClient()

  const [post, comment, review, medal] = await Promise.all([
    db
      .from("forum_posts")
      .select("title, slug, created_at")
      .eq("user_id", userId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("forum_comments")
      .select("created_at")
      .eq("user_id", userId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("peripheral_reviews")
      .select("created_at")
      .eq("user_id", userId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("user_medals")
      .select("awarded_at, medals ( name )")
      .eq("user_id", userId)
      .order("awarded_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const out: AccountMilestone[] = []

  if (post.data) {
    out.push({
      kind: "first_post",
      at: post.data.created_at,
      detail: post.data.title,
      href: `/forum/${post.data.slug}`,
    })
  }
  if (comment.data) {
    out.push({ kind: "first_comment", at: comment.data.created_at, detail: null, href: null })
  }
  if (review.data) {
    out.push({ kind: "first_review", at: review.data.created_at, detail: null, href: null })
  }
  if (medal.data) {
    const row = medal.data as unknown as {
      awarded_at: string
      medals: { name: string } | { name: string }[] | null
    }
    const info = Array.isArray(row.medals) ? row.medals[0] : row.medals
    out.push({
      kind: "first_medal",
      at: row.awarded_at,
      detail: info?.name ?? null,
      href: "/conquistas",
    })
  }

  return out
}
