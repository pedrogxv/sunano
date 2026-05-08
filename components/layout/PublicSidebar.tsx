"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgePercent,
  Clock3,
  Home,
  Menu,
  MessageCircle,
  Mouse,
  Newspaper,
  PlaySquare,
  Store,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useSidebar } from "@/lib/sidebar-context"
import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"

type Category = "all" | "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset"

interface PublicSidebarProps {
  onCategoryChange?: (category: Category) => void
}

export function PublicSidebar({ onCategoryChange }: PublicSidebarProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const { publicCollapsed: isCollapsed, isMobileOpen, setMobileOpen } = useSidebar()
  const pathname = usePathname()

  const isHomePage = pathname === "/"
  const navItems = [
    { href: "/", label: isEnglish ? "Home" : "Home", icon: Home },
    { href: "/noticias", label: isEnglish ? "News" : "Noticias", icon: Newspaper },
    { href: "/perifericos", label: isEnglish ? "Peripherals" : "Perifericos", icon: Mouse },
    { href: "/blog", label: isEnglish ? "Reviews" : "Reviews", icon: Newspaper },
    { href: "/offers", label: isEnglish ? "Offers" : "Ofertas", icon: BadgePercent },
    { href: "/forum", label: isEnglish ? "Forum" : "Forum", icon: MessageCircle },
    { href: "/videos", label: isEnglish ? "Videos" : "Videos", icon: PlaySquare },
  ]

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col bg-[##171717] border-border transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        {/* Navigation */}
        <nav className="flex-1 overflow-hidden px-3 pt-6 pb-4">
          <div className="flex items-center gap-3 pb-6">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg from-primary to-primary/80 font-bold text-primary-foreground shadow-lg shadow-black/20">
              S
            </div>
            <div className={cn("flex flex-col", isCollapsed && "hidden")}>
              <span className="text-sm font-semibold tracking-tight text-foreground">Sunano</span>
              <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Tierlist</span>
            </div>
          </div>

          {/* Main Nav */}
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.href === "/" ? isHomePage : pathname?.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (item.href === "/") onCategoryChange?.("all")
                    setMobileOpen(false)
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isCollapsed && "justify-center",
                    isActive
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

          {/* Divider */}
          <div className="my-4 h-px bg-border" />

          {/* Coming Soon */}
          <div className="space-y-1">
            <p className={cn("mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground", isCollapsed && "hidden")}>
              {isEnglish ? "Coming Soon" : "Em Breve"}
            </p>
            <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground", isCollapsed && "justify-center")}>
              <div className="size-[18px] shrink-0 rounded bg-muted/40">
              <Store className="size-[18px] shrink-0" />
              </div>
              <span className={cn(isCollapsed && "hidden")}> {isEnglish ? "Store" : "Loja"}</span>
              <span className={cn("ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300", isCollapsed && "hidden")}>
                Soon
              </span>
            </div>
          </div>
        </nav>

        {/* Changelog */}
        <div className="border-t border-border px-3 py-3">
          <Link
            href="/changelog"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              isCollapsed && "justify-center",
              pathname?.startsWith("/changelog")
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <Clock3 className="size-[16px] shrink-0" />
            <span className={cn(isCollapsed && "hidden")}>Changelog</span>
          </Link>
        </div>
      </aside>

      {/* Mobile Toggle Button */}
      <Button
        className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-muted/40 md:hidden"
        onClick={() => setMobileOpen(!isMobileOpen)}
        size="icon"
      >
        {isMobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>
    </>
  )
}
