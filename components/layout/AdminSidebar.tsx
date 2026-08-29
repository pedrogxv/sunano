"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  BookOpen,
  ChevronDown,
  Eye,
  GalleryHorizontalEnd,
  Handshake,
  Home,
  LifeBuoy,
  Medal,
  Sparkles,
  Megaphone,
  MessageSquare,
  Mouse,
  Newspaper,
  Package,
  PlaySquare,
  Settings,
  ShoppingBag,
  Tag,
  Tags,
  Trophy,
  Users,
  Wrench,
} from "lucide-react"
import { useEffect, useState } from "react"

import { AuthUser } from "@/components/auth/auth-user"
import { SunanoLogo } from "@/components/ui/SunanoLogo"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import {
  hasAdminPermission,
  isWebMaster,
  type AdminPermissionKey,
  type AdminProfile,
} from "@/lib/admin-permissions"

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  permission?: AdminPermissionKey
  requiresWebMaster?: boolean
  children?: NavItem[]
  /** Contador exibido como pill ao lado do label — hoje só "Suporte" (chamados aguardando resposta). */
  badgeCount?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-border/50" />
  return (
    <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
      {label}
    </p>
  )
}

export function AdminSidebar() {
  const t = useT()
  const pathname = usePathname()
  const { adminCollapsed, isAdminMobileOpen, setAdminMobileOpen } = useSidebar()

  // Mesmo motivo do PublicSidebar: o colapso é do desktop, o drawer mobile é
  // sempre largo e não deve herdar o modo só-ícones.
  const isCollapsed = adminCollapsed && !isAdminMobileOpen

  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [expandedHref, setExpandedHref] = useState<string | null>(null)
  const [supportAwaitingCount, setSupportAwaitingCount] = useState(0)

  const navGroups: NavGroup[] = [
    {
      label: t.admin.sidebar.general,
      items: [
        { href: "/admin", label: "Dashboard", icon: Home, permission: "dashboard_read" },
      ],
    },
    {
      label: t.admin.sidebar.peripherals,
      items: [
        { href: "/admin/tierlist",    label: "Tierlist",                       icon: Trophy,     permission: "peripherals_read" },
        { href: "/admin/perifericos", label: t.admin.sidebar.peripherals,      icon: Mouse,      permission: "peripherals_read" },
        { href: "/admin/ranking",     label: "Ranking",                        icon: BarChart2,  permission: "peripherals_read" },
        { href: "/admin/brands",      label: "Marcas",                         icon: Tag,        permission: "brands_read" },
      ],
    },
    {
      label: t.admin.sidebar.content,
      items: [
        { href: "/admin/banners", label: "Banners da Home",             icon: GalleryHorizontalEnd, permission: "banners_read" },
        { href: "/admin/blog",   label: t.admin.sidebar.newsAndReviews, icon: Newspaper,     permission: "blog_read" },
        { href: "/admin/forum",  label: t.admin.sidebar.forum,          icon: MessageSquare, permission: "forum_read" },
        { href: "/admin/videos", label: "Vídeos",                       icon: PlaySquare },
        { href: "/admin/eventos", label: "Conquistas",                 icon: Medal,          permission: "events_read" },
        { href: "/admin/aura-itens", label: "Itens de Aura",           icon: Sparkles,       permission: "events_read" },
      ],
    },
    {
      label: t.admin.sidebar.shop,
      items: [
        {
          href: "/admin/store",
          label: t.admin.sidebar.store,
          icon: ShoppingBag,
          permission: "store_read",
          children: [
            { href: "/admin/store",         label: "Produtos", icon: ShoppingBag,          permission: "store_read" },
            { href: "/admin/store/banners", label: "Banners",  icon: GalleryHorizontalEnd, permission: "store_read" },
            { href: "/admin/store/orders",  label: "Pedidos",  icon: Package,              permission: "store_read" },
            { href: "/admin/suporte",       label: "Suporte",  icon: LifeBuoy,              permission: "support_read", badgeCount: supportAwaitingCount },
          ],
        },
        { href: "/admin/market", label: "Mercado",                      icon: Tags,        permission: "market_read" },
        {
          href: "/admin/afiliados",
          label: "Afiliados",
          icon: Handshake,
          permission: "affiliates_read",
          children: [
            { href: "/admin/afiliados",           label: "Solicitações", icon: Handshake, permission: "affiliates_read" },
            { href: "/admin/afiliados/saques",    label: "Saques",       icon: Package,   permission: "affiliates_read" },
            { href: "/admin/afiliados/comissoes", label: "Comissões",    icon: BarChart2, permission: "affiliates_read" },
          ],
        },
      ],
    },
    {
      label: t.admin.sidebar.system,
      items: [
        {
          href: "/admin/users",
          label: t.admin.sidebar.system,
          icon: Wrench,
          children: [
            { href: "/admin/users",        label: t.admin.sidebar.users,    icon: Users,     requiresWebMaster: true },
            { href: "/admin/notificacoes", label: "Avisos do sistema",      icon: Megaphone, requiresWebMaster: true },
            { href: "/admin/settings",     label: t.admin.sidebar.settings, icon: Settings,  permission: "settings_read" },
          ],
        },
      ],
    },
  ]

  useEffect(() => {
    let mounted = true
    async function loadProfile() {
      try {
        const res = await fetch("/api/admin/profile")
        if (!res.ok) {
          if (mounted) { setProfile(null); setIsLoadingProfile(false) }
          return
        }
        const data = (await res.json().catch(() => null)) as
          | { profile?: AdminProfile; supportAwaitingCount?: number }
          | null
        if (!mounted) return
        setProfile(data?.profile ?? null)
        setSupportAwaitingCount(data?.supportAwaitingCount ?? 0)
      } catch {
        if (mounted) setProfile(null)
      } finally {
        if (mounted) setIsLoadingProfile(false)
      }
    }
    loadProfile()
    return () => { mounted = false }
  }, [])

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href)
  }

  /** Rota ativa dentre os filhos — usada tanto para abrir o grupo quanto para destacar o filho certo. */
  const activeChildHref = (children: NavItem[]) => {
    // Ordena pelo href mais específico primeiro (evita /admin/store "vencer" /admin/store/orders).
    const sorted = [...children].sort((a, b) => b.href.length - a.href.length)
    return sorted.find((child) => isActive(child.href))?.href ?? null
  }

  function canSee(item: NavItem) {
    if (item.requiresWebMaster) return isWebMaster(profile)
    if (!item.permission) return true
    return hasAdminPermission(profile, item.permission)
  }

  function filterItems(items: NavItem[]) {
    if (!profile) return []
    return items
      .filter(canSee)
      .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item))
      .filter((item) => !item.children || item.children.length > 0)
  }

  const close = () => setAdminMobileOpen(false)

  return (
    <>
      {/* Mobile overlay */}
      {isAdminMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col bg-background transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isAdminMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Brand */}
        <div className={cn("flex px-3 pt-6 pb-4", isCollapsed ? "justify-center" : "items-center")}>
          <SunanoLogo showText={!isCollapsed} subtitle="Admin" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
          {isLoadingProfile ? (
            // Espelha: Geral(1), Periféricos(3), Conteúdo(2), Loja(2), Sistema(2), Ações(1)
            <div className="pt-1">
              {[1, 3, 2, 2, 2, 1].map((count, gi) => (
                <div key={gi}>
                  {isCollapsed ? (
                    <div className="my-2 h-px bg-muted/20" />
                  ) : (
                    <div className="mb-1 mt-4 mx-3 h-2 w-12 rounded bg-muted/30 animate-pulse" />
                  )}
                  <div className="space-y-1">
                    {Array.from({ length: count }).map((_, ii) => (
                      <div
                        key={ii}
                        className={cn(
                          "h-10 rounded-lg bg-muted/30 animate-pulse",
                          isCollapsed ? "w-10 mx-auto" : "w-full"
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            navGroups.map((group) => {
              const visible = filterItems(group.items)
              if (visible.length === 0) return null
              return (
                <div key={group.label}>
                  <SectionLabel label={group.label} collapsed={isCollapsed} />
                  <div className="space-y-1">
                    {visible.map((item) => {
                      const Icon = item.icon

                      if (item.children && item.children.length > 0) {
                        const activeChild = activeChildHref(item.children)
                        const open = expandedHref === item.href || activeChild !== null
                        const childrenBadgeCount = item.children.reduce((sum, child) => sum + (child.badgeCount ?? 0), 0)

                        return (
                          <div key={item.href} className="relative">
                            <button
                              type="button"
                              onClick={() => setExpandedHref((prev) => (prev === item.href ? null : item.href))}
                              aria-expanded={open}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                isCollapsed && "justify-center",
                                activeChild
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                              )}
                            >
                              <Icon className="size-[18px] shrink-0" />
                              <span className={cn("flex-1 text-left", isCollapsed && "hidden")}>{item.label}</span>
                              {Boolean(childrenBadgeCount) && (
                                <span className={cn(
                                  "flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white",
                                  isCollapsed && "absolute right-1 top-1 h-4 min-w-4 px-0.5 text-[9px]"
                                )}>
                                  {childrenBadgeCount}
                                </span>
                              )}
                              <ChevronDown
                                className={cn(
                                  "size-3.5 shrink-0 transition-transform duration-200",
                                  isCollapsed && "hidden",
                                  open && "rotate-180"
                                )}
                              />
                            </button>
                            {!isCollapsed && (
                              <div
                                className="grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out"
                                style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                              >
                                <div className="min-h-0">
                                  <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                                    {item.children.map((child) => {
                                      const ChildIcon = child.icon
                                      const childActiveState = child.href === activeChild
                                      return (
                                        <Link
                                          key={child.href}
                                          href={child.href}
                                          onClick={close}
                                          className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                            childActiveState
                                              ? "bg-primary text-primary-foreground"
                                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                          )}
                                        >
                                          <ChildIcon className="size-4 shrink-0" />
                                          <span className="flex-1">{child.label}</span>
                                          {Boolean(child.badgeCount) && (
                                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                                              {child.badgeCount}
                                            </span>
                                          )}
                                        </Link>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      }

                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={close}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                            isCollapsed && "justify-center",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          )}
                        >
                          <Icon className="size-[18px] shrink-0" />
                          <span className={cn("flex-1", isCollapsed && "hidden")}>{item.label}</span>
                          {Boolean(item.badgeCount) && !isCollapsed && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                              {item.badgeCount}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}

          {/* Ver site */}
          {!isLoadingProfile && (
            <>
              <SectionLabel label={t.admin.sidebar.actions} collapsed={isCollapsed} />
              <Link
                href="/"
                onClick={close}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary",
                  isCollapsed && "justify-center"
                )}
              >
                <Eye className="size-[18px] shrink-0" />
                <span className={cn(isCollapsed && "hidden")}>{t.admin.sidebar.viewSite}</span>
              </Link>
            </>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-border px-3 py-2">
          <AuthUser isCollapsed={isCollapsed} />
        </div>
      </aside>
    </>
  )
}
