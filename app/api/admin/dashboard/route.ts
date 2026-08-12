import { NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getTelegramOffers } from "@/lib/server/integrations/telegram-offers"
import { countActiveBanners, MAX_ACTIVE_BANNERS } from "@/lib/server/repositories/banners-repository"
import { getPerformanceSeries, type PerformanceSeries } from "@/lib/server/repositories/dashboard-performance-repository"
import { getVisitStats } from "@/lib/server/repositories/visits-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type SectionStats = Record<string, number>

// Cada bloco só roda se o perfil tiver a permissão de leitura correspondente —
// além de mais barato, evita vazar contagens de seções que o admin não pode ver.
export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const profile = auth.profile
  const db = createSupabaseAdminClient()

  const stats: Record<string, SectionStats | null> & { visits: SectionStats | null; performance: PerformanceSeries | null } = {
    peripherals: null,
    blog: null,
    forum: null,
    store: null,
    offers: null,
    banners: null,
    visits: null,
    performance: null,
  }

  // Cada seção roda isolada: se uma falhar (ex.: integração externa fora do ar),
  // as outras continuam aparecendo em vez de derrubar a dashboard inteira.
  const safe = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (error) {
      console.error(`[admin/dashboard] ${label}:`, error)
    }
  }

  await Promise.all([
    safe("peripherals", async () => {
      if (!hasAdminPermission(profile, "peripherals_read")) return
      const { data } = await db.from("peripherals").select("specs")
      const rows = (data ?? []) as { specs: Record<string, unknown> | null }[]
      stats.peripherals = {
        total: rows.length,
        pendingReview: rows.filter((p) => p.specs?.reviewApproved !== true).length,
      }
    }),
    safe("blog", async () => {
      if (!hasAdminPermission(profile, "blog_read")) return
      const { data } = await db.from("blog_posts").select("is_published")
      const rows = (data ?? []) as { is_published: boolean }[]
      stats.blog = {
        total: rows.length,
        published: rows.filter((p) => p.is_published).length,
        draft: rows.filter((p) => !p.is_published).length,
      }
    }),
    safe("forum", async () => {
      if (!hasAdminPermission(profile, "forum_read")) return
      const { count: total } = await db.from("forum_posts").select("id", { count: "exact", head: true })
      const { count: hidden } = await db
        .from("forum_posts")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", true)
      stats.forum = { total: total ?? 0, hidden: hidden ?? 0 }
    }),
    safe("store", async () => {
      if (!hasAdminPermission(profile, "store_read")) return
      const { data } = await db.from("store_products").select("stock, is_active")
      const rows = (data ?? []) as { stock: number | null; is_active: boolean }[]
      stats.store = {
        total: rows.length,
        active: rows.filter((p) => p.is_active).length,
        outOfStock: rows.filter((p) => (p.stock ?? 0) <= 0).length,
      }
    }),
    safe("offers", async () => {
      if (!hasAdminPermission(profile, "offers_read")) return
      const result = await getTelegramOffers(30)
      stats.offers = { active: result.offers.length }
    }),
    safe("banners", async () => {
      if (!hasAdminPermission(profile, "banners_read")) return
      const { count: total } = await db.from("home_banners").select("id", { count: "exact", head: true })
      const active = await countActiveBanners()
      stats.banners = { total: total ?? 0, active, max: MAX_ACTIVE_BANNERS }
    }),
    safe("visits", async () => {
      if (!hasAdminPermission(profile, "dashboard_read")) return
      const visitStats = await getVisitStats()
      stats.visits = { ...visitStats }
    }),
    safe("performance", async () => {
      // Cruza dados de fórum, blog e aura — gate no dashboard_read (visão
      // agregada), não nas permissões de cada domínio individual.
      if (!hasAdminPermission(profile, "dashboard_read")) return
      stats.performance = await getPerformanceSeries()
    }),
  ])

  return NextResponse.json({ stats })
}
