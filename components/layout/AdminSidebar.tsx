"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  BookOpen,
  Eye,
  Gift,
  Home,
  Menu,
  MessageSquare,
  Mouse,
  Newspaper,
  Settings,
  ShoppingBag,
  Trophy,
  Users,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { AuthUser } from "@/components/auth/auth-user"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useLocale } from "@/components/providers/locale-context"
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
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const pathname = usePathname()
  const { adminCollapsed: isCollapsed, isAdminMobileOpen, setAdminMobileOpen } = useSidebar()

  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  const navGroups: NavGroup[] = [
    {
      label: "Geral",
      items: [
        { href: "/admin", label: "Dashboard", icon: Home, permission: "dashboard_read" },
      ],
    },
    {
      label: isEnglish ? "Peripherals" : "Periféricos",
      items: [
        { href: "/admin/tierlist",    label: "Tierlist",                                    icon: Trophy,     permission: "peripherals_read" },
        { href: "/admin/perifericos", label: isEnglish ? "Peripherals" : "Periféricos",     icon: Mouse,      permission: "peripherals_read" },
        { href: "/ranking",           label: "Ranking",                                     icon: BarChart2,  permission: "peripherals_read" },
      ],
    },
    {
      label: isEnglish ? "Content" : "Conteúdo",
      items: [
        { href: "/admin/blog",   label: isEnglish ? "News & Reviews" : "Notícias & Reviews", icon: Newspaper,     permission: "blog_read" },
        { href: "/admin/forum",  label: isEnglish ? "Forum" : "Fórum",                       icon: MessageSquare, permission: "forum_read" },
      ],
    },
    {
      label: isEnglish ? "Shop" : "Loja",
      items: [
        { href: "/admin/offers", label: isEnglish ? "Offers" : "Ofertas",         icon: Gift,       permission: "offers_read" },
        { href: "/admin/store",  label: isEnglish ? "Store & Bazar" : "Loja & Bazar", icon: ShoppingBag, permission: "store_read" },
      ],
    },
    {
      label: isEnglish ? "System" : "Sistema",
      items: [
        { href: "/admin/users",    label: isEnglish ? "Users" : "Usuários",            icon: Users,    requiresWebMaster: true },
        { href: "/admin/settings", label: isEnglish ? "Settings" : "Configurações",    icon: Settings, permission: "settings_read" },
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
        const data = (await res.json().catch(() => null)) as { profile?: AdminProfile } | null
        if (!mounted) return
        setProfile(data?.profile ?? null)
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

  function filterItems(items: NavItem[]) {
    if (!profile) return []
    return items.filter((item) => {
      if (item.requiresWebMaster) return isWebMaster(profile)
      if (!item.permission) return true
      return hasAdminPermission(profile, item.permission)
    })
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
          "fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isAdminMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Brand */}
        <div className={cn("flex items-center px-3 pt-6 pb-4", isCollapsed ? "justify-center" : "gap-3")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground shadow-lg shadow-black/20">
            S
          </div>
          <div className={cn("flex flex-col", isCollapsed && "hidden")}>
            <span className="text-sm font-semibold tracking-tight text-foreground">Sunano</span>
            <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Admin</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
          {isLoadingProfile ? (
            <div className="space-y-1 pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-10 rounded-lg bg-muted/30 animate-pulse",
                    isCollapsed ? "w-10 mx-auto" : "w-full"
                  )}
                />
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
                          <span className={cn(isCollapsed && "hidden")}>{item.label}</span>
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
              <SectionLabel label={isEnglish ? "Actions" : "Ações"} collapsed={isCollapsed} />
              <Link
                href="/"
                onClick={close}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary",
                  isCollapsed && "justify-center"
                )}
              >
                <Eye className="size-[18px] shrink-0" />
                <span className={cn(isCollapsed && "hidden")}>{isEnglish ? "View Site" : "Ver Site"}</span>
              </Link>
            </>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-border px-3 py-2">
          <AuthUser isCollapsed={isCollapsed} />
        </div>
      </aside>

      {/* Mobile toggle */}
      <Button
        className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-muted/40 md:hidden"
        onClick={() => setAdminMobileOpen(!isAdminMobileOpen)}
        size="icon"
      >
        {isAdminMobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>
    </>
  )
}
