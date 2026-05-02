"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Eye, Gift, Home, LogOut, Menu, NotebookPen, Package, Settings, Users, X } from "lucide-react"
import { useEffect, useState } from "react"

import { logoutAction } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"
import { hasAdminPermission, type AdminPermissionKey, type AdminProfile, isWebMaster } from "@/lib/admin-permissions"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [profile, setProfile] = useState<AdminProfile | null>(null)

  const navItems = [
    { href: "/admin", label: isEnglish ? "Dashboard" : "Dashboard", icon: Home, permission: "dashboard_read" },
    { href: "/admin/peripherals", label: isEnglish ? "Tier List" : "Tier List", icon: Package, permission: "peripherals_read" },
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen pt-16 md:pl-64">
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 top-16 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r border-border bg-card transition-transform duration-300 md:translate-x-0",
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <nav className="flex-1 overflow-hidden px-3 pt-6 pb-4">
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
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="my-4 h-px bg-border" />

            <div className="space-y-1">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {isEnglish ? "Actions" : "Acoes"}
              </p>
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
              >
                <Eye className="size-[18px]" />
                <span>{isEnglish ? "View Site" : "Ver Site"}</span>
              </Link>
              <form action={logoutAction}>
                <Button
                  className="w-full justify-start gap-3 text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                  type="submit"
                  variant="ghost"
                >
                  <LogOut className="size-[18px]" />
                  <span>{isEnglish ? "Sign out" : "Sair"}</span>
                </Button>
              </form>
            </div>
          </nav>

          <div className="border-t border-border px-4 py-3">
            <p className="text-[10px] text-muted-foreground">Sunano Admin v1.0</p>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </main>

        <Button
          className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-muted/40 md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          size="icon"
        >
          {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>
    </div>
  )
}