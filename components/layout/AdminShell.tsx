"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight, Eye, Gift, Home, LogOut, Menu, NotebookPen, Package, Settings, Users, X } from "lucide-react"
import { useEffect, useState } from "react"

import { logoutAction } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/lib/sidebar-context"
import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"
import { hasAdminPermission, type AdminPermissionKey, type AdminProfile, isWebMaster } from "@/lib/admin-permissions"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { adminCollapsed: isCollapsed, toggleAdmin: toggleCollapsed } = useSidebar()
  const [profile, setProfile] = useState<AdminProfile | null>(null)

  const navItems = [
    { href: "/admin", label: isEnglish ? "Dashboard" : "Dashboard", icon: Home, permission: "dashboard_read" },
    { href: "/admin/tierlist", label: isEnglish ? "Tierlist" : "Tierlist", icon: Package, permission: "peripherals_read" },
    { href: "/admin/perifericos", label: isEnglish ? "Peripherals" : "Perifericos", icon: Package, permission: "peripherals_read" },
    { href: "/admin/blog", label: isEnglish ? "Blog & Reviews" : "Blog & Reviews", icon: NotebookPen, permission: "blog_read" },
    { href: "/admin/offers", label: isEnglish ? "Offers" : "Ofertas", icon: Gift, permission: "offers_read" },
    { href: "/admin/users", label: isEnglish ? "Users" : "Usuários", icon: Users, requiresWebMaster: true },
    { href: "/admin/settings", label: isEnglish ? "Settings" : "Configurações", icon: Settings, permission: "settings_read" },
  ]

  useEffect(() => {
    let isMounted = true

    async function loadProfile() {
      try {
        const response = await fetch("/api/admin/profile")
        const data = (await response.json().catch(() => null)) as
          | { profile?: AdminProfile }
          | null

        if (!response.ok || !data?.profile || !isMounted) return

        setProfile(data.profile)
      } catch {
        if (isMounted) setProfile(null)
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [])

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href) && href !== "/"
  }

  const visibleNavItems = navItems.filter((item) => {
    if (!profile) return true
    if ("requiresWebMaster" in item && item.requiresWebMaster) {
      return isWebMaster(profile)
    }
    if (!("permission" in item) || !item.permission) return true
    return hasAdminPermission(profile, item.permission as AdminPermissionKey)
  })

  return (
    <div className="min-h-screen text-foreground">
      <div className={cn("flex min-h-screen ", isCollapsed ? "md:pl-16" : "md:pl-64")}>
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 top-16 z-30  backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] shrink-0 flex-col transition-all duration-300 md:translate-x-0",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
            isCollapsed ? "md:w-16" : "md:w-64"
          )}
        >
          <div className={cn("flex items-center justify-end px-3 pt-4", isCollapsed && "justify-center")}>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden md:flex size-8 items-center justify-center rounded-full  bg-muted/40 text-foreground transition hover:bg-muted/60"
              aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
              title={isCollapsed ? "Expandir" : "Recolher"}
            >
              {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          </div>

          <nav className="flex-1 overflow-hidden px-3 pt-4 pb-4">
            <div className="space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      isCollapsed && "justify-center",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-[18px]" />
                    <span className={cn(isCollapsed && "hidden")}>{item.label}</span>
                  </Link>
                )
              })}
            </div>


            <div className="space-y-1">
              <p className={cn("mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", isCollapsed && "hidden")}>
                {isEnglish ? "Actions" : "Acoes"}
              </p>
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary",
                  isCollapsed && "justify-center"
                )}
              >
                <Eye className="size-[18px]" />
                <span className={cn(isCollapsed && "hidden")}>{isEnglish ? "View Site" : "Ver Site"}</span>
              </Link>
              <form action={logoutAction}>
                <Button
                  className={cn(
                    "w-full justify-start gap-3 text-muted-foreground hover:bg-red-500/10 hover:text-red-300",
                    isCollapsed && "justify-center"
                  )}
                  type="submit"
                  variant="ghost"
                >
                  <LogOut className="size-[18px]" />
                  <span className={cn(isCollapsed && "hidden")}>{isEnglish ? "Sign out" : "Sair"}</span>
                </Button>
              </form>
            </div>
          </nav>

          <div className="px-4 py-3">
            <p className={cn("text-[10px] text-muted-foreground", isCollapsed && "hidden")}>Sunano Admin v1.0</p>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>

        <Button
          className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-card text-foreground shadow-lg hover:bg-muted/40 md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          size="icon"
        >
          {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>
    </div>
  )
}