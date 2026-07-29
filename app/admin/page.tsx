"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  GalleryHorizontalEnd,
  Gift,
  LayoutGrid,
  MessageSquare,
  Mouse,
  NotebookPen,
  PlaySquare,
  Plus,
  Settings,
  ShoppingBag,
  Trophy,
  Users,
  Zap,
} from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { hasAdminPermission, isWebMaster, type AdminProfile } from "@/lib/admin-permissions"

type DashboardStats = {
  peripherals: { total: number; pendingReview: number } | null
  blog: { total: number; published: number; draft: number } | null
  forum: { total: number; hidden: number } | null
  store: { total: number; active: number; outOfStock: number } | null
  offers: { active: number } | null
  banners: { total: number; active: number; max: number } | null
}

type ColorKey = "cyan" | "emerald" | "amber" | "violet" | "rose" | "sky" | "fuchsia" | "orange" | "slate"

const COLOR_STYLES: Record<ColorKey, { icon: string; hover: string }> = {
  cyan: { icon: "bg-cyan-500/15 text-cyan-300", hover: "hover:border-cyan-400/40 hover:bg-cyan-500/5" },
  emerald: { icon: "bg-emerald-500/15 text-emerald-300", hover: "hover:border-emerald-400/40 hover:bg-emerald-500/5" },
  amber: { icon: "bg-amber-500/15 text-amber-300", hover: "hover:border-amber-400/40 hover:bg-amber-500/5" },
  violet: { icon: "bg-violet-500/15 text-violet-300", hover: "hover:border-violet-400/40 hover:bg-violet-500/5" },
  rose: { icon: "bg-rose-500/15 text-rose-300", hover: "hover:border-rose-400/40 hover:bg-rose-500/5" },
  sky: { icon: "bg-sky-500/15 text-sky-300", hover: "hover:border-sky-400/40 hover:bg-sky-500/5" },
  fuchsia: { icon: "bg-fuchsia-500/15 text-fuchsia-300", hover: "hover:border-fuchsia-400/40 hover:bg-fuchsia-500/5" },
  orange: { icon: "bg-orange-500/15 text-orange-300", hover: "hover:border-orange-400/40 hover:bg-orange-500/5" },
  slate: { icon: "bg-slate-500/15 text-slate-300", hover: "hover:border-slate-400/40 hover:bg-slate-500/5" },
}

function StatSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <Skeleton className="size-7 rounded-lg" />
      <Skeleton className="mt-3 h-6 w-10" />
      <Skeleton className="mt-1.5 h-3 w-20" />
    </div>
  )
}

function ActionSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <Skeleton className="h-4 flex-1" />
    </div>
  )
}

export default function AdminPage() {
  const t = useT()
  const d = t.admin.dashboard
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/admin/profile").then((res) => (res.ok ? res.json() : null)).catch(() => null),
      fetch("/api/admin/dashboard", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)).catch(() => null),
    ]).then(([profileJson, statsJson]) => {
      if (cancelled) return
      setProfile(profileJson?.profile ?? null)
      setStats(statsJson?.stats ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? d.greetingMorning : hour < 18 ? d.greetingAfternoon : d.greetingEvening
  const firstName = profile?.display_name?.split(" ")[0]

  const statTiles = [
    stats?.peripherals && {
      href: "/admin/perifericos",
      icon: Mouse,
      color: "cyan" as ColorKey,
      value: stats.peripherals.total,
      label: d.statPeripherals,
      caption: d.statPeripheralsCaption(stats.peripherals.pendingReview),
      alert: stats.peripherals.pendingReview > 0,
    },
    stats?.blog && {
      href: "/admin/blog",
      icon: NotebookPen,
      color: "amber" as ColorKey,
      value: stats.blog.published,
      label: d.statBlog,
      caption: d.statBlogCaption(stats.blog.draft),
      alert: stats.blog.draft > 0,
    },
    stats?.forum && {
      href: "/admin/forum",
      icon: MessageSquare,
      color: "violet" as ColorKey,
      value: stats.forum.total,
      label: d.statForum,
      caption: d.statForumCaption(stats.forum.hidden),
      alert: false,
    },
    stats?.store && {
      href: "/admin/store",
      icon: ShoppingBag,
      color: "emerald" as ColorKey,
      value: stats.store.active,
      label: d.statStore,
      caption: d.statStoreCaption(stats.store.outOfStock),
      alert: stats.store.outOfStock > 0,
    },
    stats?.offers && {
      href: "/admin/offers",
      icon: Gift,
      color: "rose" as ColorKey,
      value: stats.offers.active,
      label: d.statOffers,
      caption: d.statOffersCaption,
      alert: false,
    },
    stats?.banners && {
      href: "/admin/banners",
      icon: GalleryHorizontalEnd,
      color: "sky" as ColorKey,
      value: stats.banners.active,
      label: d.statBanners,
      caption: d.statBannersCaption(stats.banners.active, stats.banners.max),
      alert: false,
    },
  ].filter((tile): tile is NonNullable<typeof tile> => Boolean(tile))

  const attentionItems = [
    // /admin/tierlist/revisao permite aprovar/categorizar direto na página —
    // o middleware exige peripherals_write pra entrar lá, então só linkamos
    // quem tem essa permissão (peripherals_read sozinho cairia num redirect).
    stats?.peripherals && stats.peripherals.pendingReview > 0 && hasAdminPermission(profile, "peripherals_write")
      ? { href: "/admin/tierlist/revisao", label: d.attentionPendingReview(stats.peripherals.pendingReview) }
      : null,
    stats?.blog && stats.blog.draft > 0
      ? { href: "/admin/blog", label: d.attentionDrafts(stats.blog.draft) }
      : null,
    stats?.store && stats.store.outOfStock > 0
      ? { href: "/admin/store", label: d.attentionOutOfStock(stats.store.outOfStock) }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  const actions = [
    { href: "/admin/perifericos/new", icon: Plus, color: "cyan" as ColorKey, label: d.actionNewPeripheral, allowed: hasAdminPermission(profile, "peripherals_write") },
    { href: "/admin/tierlist", icon: Trophy, color: "cyan" as ColorKey, label: d.actionOrganizeTierList, allowed: hasAdminPermission(profile, "peripherals_read") },
    { href: "/admin/blog/new", icon: NotebookPen, color: "amber" as ColorKey, label: d.actionWritePost, allowed: hasAdminPermission(profile, "blog_write") },
    { href: "/admin/forum", icon: MessageSquare, color: "violet" as ColorKey, label: d.actionModerateForum, allowed: hasAdminPermission(profile, "forum_read") },
    { href: "/admin/offers", icon: Gift, color: "rose" as ColorKey, label: d.actionViewOffers, allowed: hasAdminPermission(profile, "offers_read") },
    { href: "/admin/store/new", icon: ShoppingBag, color: "emerald" as ColorKey, label: d.actionNewProduct, allowed: hasAdminPermission(profile, "store_write") },
    { href: "/admin/banners", icon: GalleryHorizontalEnd, color: "sky" as ColorKey, label: d.actionBanners, allowed: hasAdminPermission(profile, "banners_read") },
    { href: "/admin/ranking", icon: BarChart2, color: "cyan" as ColorKey, label: d.actionRanking, allowed: hasAdminPermission(profile, "peripherals_read") },
    { href: "/admin/videos", icon: PlaySquare, color: "fuchsia" as ColorKey, label: d.actionVideos, allowed: true },
    { href: "/admin/users", icon: Users, color: "orange" as ColorKey, label: d.actionUsers, allowed: isWebMaster(profile) },
    { href: "/admin/settings", icon: Settings, color: "slate" as ColorKey, label: d.actionSettings, allowed: hasAdminPermission(profile, "settings_read") },
  ].filter((action) => action.allowed)

  return (
    <div className="space-y-6">
      {/* Header — compacto, mas com um toque de identidade (gradiente sutil + saudação) */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(217,70,239,0.08),transparent_40%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">{d.title}</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-foreground md:text-2xl">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{d.subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            {d.liveLabel}
          </div>
        </div>
      </div>

      {/* Visão geral — stats reais, clicáveis, com contador animado */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <LayoutGrid className="size-3.5" />
          {d.overview}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
            : statTiles.map((tile, index) => {
                const Icon = tile.icon
                const styles = COLOR_STYLES[tile.color]
                return (
                  <Link
                    key={tile.href}
                    href={tile.href}
                    style={{ animationDelay: `${index * 60}ms` }}
                    className={cn(
                      "group animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-card p-3 transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5",
                      styles.hover
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className={cn("flex size-7 items-center justify-center rounded-lg transition-colors", styles.icon)}>
                        <Icon className="size-3.5" />
                      </div>
                      {tile.alert && <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-amber-400" />
                      </span>}
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                      <AnimatedCounter value={tile.value} duration={900} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tile.label} · {tile.caption}
                    </p>
                  </Link>
                )
              })}
        </div>
      </div>

      {/* Precisa de atenção — só aparece quando há algo pendente de fato */}
      {!loading && attentionItems.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 duration-300">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="size-4" />
            {d.needsAttention}
          </h2>
          <div className="space-y-1">
            {attentionItems.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-amber-500/10"
              >
                <span>{item.label}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Ações rápidas — grid compacto, filtrado pela permissão de cada admin */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Zap className="size-3.5" />
          {d.quickActions}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <ActionSkeleton key={i} />)
            : actions.map((action, index) => {
                const Icon = action.icon
                const styles = COLOR_STYLES[action.color]
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    style={{ animationDelay: `${index * 40}ms` }}
                    className={cn(
                      "group flex animate-in items-center gap-3 fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-card p-3 transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5",
                      styles.hover
                    )}
                  >
                    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors", styles.icon)}>
                      <Icon className="size-4" />
                    </div>
                    <span className="truncate text-sm font-medium text-foreground">{action.label}</span>
                    <ArrowRight className="ml-auto size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </Link>
                )
              })}
        </div>
      </div>
    </div>
  )
}
