"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Eye,
  Gift,
  Home,
  Menu,
  MessageSquare,
  NotebookPen,
  Package,
  Settings,
  Users,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { AuthUser } from "@/components/auth/auth-user"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/lib/sidebar-context"
import { useLocale } from "@/lib/locale-context"
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

export function AdminSidebar() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const pathname = usePathname()
  const { adminCollapsed: isCollapsed, isAdminMobileOpen, setAdminMobileOpen } = useSidebar()

  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  const navItems: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: Home, permission: "dashboard_read" },
    { href: "/admin/tierlist", label: "Tierlist", icon: Package, permission: "peripherals_read" },
    { href: "/admin/perifericos", label: isEnglish ? "Peripherals" : "Perifericos", icon: Package, permission: "peripherals_read" },
    { href: "/admin/blog", label: "Blog & Reviews", icon: NotebookPen, permission: "blog_read" },
    { href: "/admin/forum", label: isEnglish ? "Forum" : "Fórum", icon: MessageSquare, permission: "forum_read" },
    { href: "/admin/offers", label: isEnglish ? "Offers" : "Ofertas", icon: Gift, permission: "offers_read" },
    { href: "/admin/users", label: isEnglish ? "Users" : "Usuários", icon: Users, requiresWebMaster: true },
    { href: "/admin/settings", label: isEnglish ? "Settings" : "Configurações", icon: Settings, permission: "settings_read" },
  ]

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      try {
        const res = await fetch("/api/admin/profile")
        if (!res.ok) {
          if (mounted) {
            setProfile(null)
            setIsLoadingProfile(false)
          }
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

  // While loading: show nothing — never flash items the user may not have access to
  const visibleNavItems = isLoadingProfile
    ? []
    : navItems.filter((item) => {
        if (!profile) return false
        if (item.requiresWebMaster) return isWebMaster(profile)
        if (!item.permission) return true
        return hasAdminPermission(profile, item.permission)
      })

  return (
    <>
      {/* Mobile Overlay */}
      {isAdminMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setAdminMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isAdminMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Header: brand + collapse toggle */}
        <div className={cn("flex items-center px-3 pt-6 pb-4", isCollapsed ? "justify-center" : "justify-between")}>
          <div className={cn("flex items-center gap-3", isCollapsed && "hidden")}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg font-bold text-primary-foreground shadow-lg shadow-black/20 bg-primary">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-foreground">Sunano</span>
              <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Admin</span>
            </div>
          </div>

          {isCollapsed && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg font-bold text-primary-foreground bg-primary">
              S
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-hidden px-3 pb-4">
          {/* Main nav */}
          <div className="space-y-1">
            {isLoadingProfile ? (
              /* Skeleton while profile loads — no item flashing */
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-10 rounded-lg bg-muted/30 animate-pulse",
                    isCollapsed ? "w-10 mx-auto" : "w-full"
                  )}
                />
              ))
            ) : (
              visibleNavItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAdminMobileOpen(false)}
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
              })
            )}
          </div>

          {/* Divider */}
          <div className="my-4 h-px bg-border" />

          {/* Actions */}
          <div className="space-y-1">
            <p className={cn("mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", isCollapsed && "hidden")}>
              {isEnglish ? "Actions" : "Ações"}
            </p>
            <Link
              href="/"
              onClick={() => setAdminMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary",
                isCollapsed && "justify-center"
              )}
            >
              <Eye className="size-[18px] shrink-0" />
              <span className={cn(isCollapsed && "hidden")}>{isEnglish ? "View Site" : "Ver Site"}</span>
            </Link>
          </div>
        </nav>

        {/* User */}
        <div className="border-t border-border px-3 py-2">
          <AuthUser isCollapsed={isCollapsed} />
        </div>
      </aside>

      {/* Mobile Toggle Button */}
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
