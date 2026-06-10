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
  Package,
  PlaySquare,
  Recycle,
  ShoppingBag,
  ShoppingCart,
  Trophy,
  X,
} from "lucide-react"

import { AuthUser } from "@/components/auth/auth-user"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useLocale } from "@/components/providers/locale-context"
import { useCart } from "@/components/providers/cart-context"
import { cn } from "@/lib/utils"

export function PublicSidebar() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const { publicCollapsed: isCollapsed, isMobileOpen, setMobileOpen } = useSidebar()
  const pathname = usePathname()
  const { count: cartCount, setOpen: openCart } = useCart()

  const isHomePage = pathname === "/"

  const mainNavItems = [
    { href: "/", label: isEnglish ? "Home" : "Início", icon: Home },
    { href: "/tierlist", label: "Tierlist", icon: Trophy },
    { href: "/noticias", label: isEnglish ? "News" : "Novidades", icon: Newspaper },
    { href: "/perifericos", label: isEnglish ? "Peripherals" : "Periféricos", icon: Mouse },
    { href: "/blog", label: "Reviews", icon: Newspaper },
    { href: "/offers", label: isEnglish ? "Offers" : "Ofertas", icon: BadgePercent },
    { href: "/forum", label: "Forum", icon: MessageCircle },
    { href: "/videos", label: "Videos", icon: PlaySquare },
  ]

  const isInStore = pathname?.startsWith("/loja") || pathname?.startsWith("/bazar")

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
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-6 pb-4">
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
            {mainNavItems.map((item) => {
              const Icon = item.icon
              const isActive = item.href === "/" ? isHomePage : pathname?.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
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

          {/* Store section */}
          <div className="mt-4">
            {/* Section label */}
            {!isCollapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {isEnglish ? "Shop" : "Compras"}
              </p>
            )}
            {isCollapsed && <div className="mb-2 h-px bg-border" />}

            <div className="space-y-1">
              {/* Loja */}
              {(() => {
                const isActive = pathname?.startsWith("/loja")
                return (
                  <Link
                    href="/loja"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      isCollapsed && "justify-center",
                      isActive
                        ? "bg-emerald-600/80 text-white shadow-sm shadow-emerald-900/40"
                        : "border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                    )}
                  >
                    <ShoppingBag className="size-[18px] shrink-0" />
                    <span className={cn("flex-1", isCollapsed && "hidden")}>
                      {isEnglish ? "Store" : "Loja"}
                    </span>
                    {/* Cart badge */}
                    {cartCount > 0 && (
                      <button
                        onClick={(e) => { e.preventDefault(); openCart(true) }}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors",
                          isCollapsed && "absolute -top-1 -right-1",
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-emerald-500 text-white"
                        )}
                        title="Ver carrinho"
                      >
                        <ShoppingCart className={cn("size-2.5", isCollapsed && "hidden")} />
                        {cartCount > 9 ? "9+" : cartCount}
                      </button>
                    )}
                  </Link>
                )
              })()}

              {/* Bazar */}
              {(() => {
                const isActive = pathname?.startsWith("/bazar")
                return (
                  <Link
                    href="/bazar"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      isCollapsed && "justify-center",
                      isActive
                        ? "bg-amber-600/80 text-white shadow-sm shadow-amber-900/40"
                        : "border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
                    )}
                  >
                    <Recycle className="size-[18px] shrink-0" />
                    <span className={cn("flex-1", isCollapsed && "hidden")}>Bazar</span>
                    {/* "Usado" pill */}
                    {!isCollapsed && (
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                        isActive ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-400"
                      )}>
                        {isEnglish ? "Used" : "Usado"}
                      </span>
                    )}
                  </Link>
                )
              })()}
            </div>

            {/* Cart quick-open — only when in store area or has items */}
            {(isInStore || cartCount > 0) && !isCollapsed && (
              <button
                onClick={() => openCart(true)}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
              >
                <ShoppingCart className="size-3.5 shrink-0" />
                <span className="flex-1 text-left">{isEnglish ? "Cart" : "Carrinho"}</span>
                {cartCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>
            )}
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
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <Clock3 className="size-[16px] shrink-0" />
            <span className={cn(isCollapsed && "hidden")}>Changelog</span>
          </Link>
        </div>

        {/* User */}
        <div className="border-t border-border px-3 py-2">
          <AuthUser isCollapsed={isCollapsed} />
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
