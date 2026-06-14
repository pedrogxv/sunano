"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgePercent,
  BarChart2,
  BookOpen,
  Clock3,
  Home,
  Menu,
  MessageCircle,
  Mouse,
  Newspaper,
  PlaySquare,
  Recycle,
  ShoppingBag,
  ShoppingCart,
  Trophy,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { AuthUser } from "@/components/auth/auth-user"
import { Button } from "@/components/ui/button"
import { SunanoLogo } from "@/components/ui/SunanoLogo"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useCart } from "@/components/providers/cart-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-border/50" />
  return (
    <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
      {label}
    </p>
  )
}

function NavLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
        collapsed && "justify-center",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className={cn(collapsed && "hidden")}>{item.label}</span>
    </Link>
  )
}

export function PublicSidebar() {
  const t = useT()
  const { publicCollapsed: isCollapsed, isMobileOpen, setMobileOpen } = useSidebar()
  const pathname = usePathname()
  const { count: cartCount, setOpen: openCart } = useCart()

  const [isAdmin, setIsAdmin] = useState(false)
  const [isAdminLoading, setIsAdminLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch("/api/admin/profile")
      .then((res) => { if (mounted) setIsAdmin(res.ok) })
      .catch(() => { if (mounted) setIsAdmin(false) })
      .finally(() => { if (mounted) setIsAdminLoading(false) })
    return () => { mounted = false }
  }, [])

  const close = () => setMobileOpen(false)
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href)

  const peripheralItems: NavItem[] = [
    { href: "/tierlist",    label: "Tierlist",           icon: Trophy },
    { href: "/perifericos", label: t.nav.peripherals,    icon: Mouse },
    { href: "/ranking",     label: "Ranking",            icon: BarChart2 },
  ]

  const contentItems: NavItem[] = [
    { href: "/noticias", label: t.nav.news,    icon: Newspaper },
    { href: "/blog",     label: "Reviews",     icon: BookOpen },
    { href: "/videos",   label: t.nav.videos,  icon: PlaySquare },
    { href: "/forum",    label: t.nav.forum,   icon: MessageCircle },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col border-border transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-6 pb-4">
          {/* Brand */}
          <Link
            href="/"
            onClick={close}
            className={cn(
              "flex pb-6",
              isCollapsed ? "justify-center" : "items-center"
            )}
          >
            <SunanoLogo showText={!isCollapsed} subtitle="Tierlist" />
          </Link>

          {/* Início */}
          <NavLink
            item={{ href: "/", label: t.nav.home, icon: Home }}
            isActive={pathname === "/"}
            collapsed={isCollapsed}
            onClick={close}
          />

          {/* Periféricos */}
          <SectionLabel label={t.nav.peripherals} collapsed={isCollapsed} />
          <div className="space-y-1">
            {peripheralItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                collapsed={isCollapsed}
                onClick={close}
              />
            ))}
          </div>

          {/* Conteúdo */}
          <SectionLabel label={t.nav.content} collapsed={isCollapsed} />
          <div className="space-y-1">
            {contentItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                collapsed={isCollapsed}
                onClick={close}
              />
            ))}
          </div>

          {/* Loja */}
          <SectionLabel label={t.nav.shop} collapsed={isCollapsed} />
          <div className="space-y-1">
            {/* Loja */}
            <Link
              href="/loja"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/loja")
                  ? "bg-emerald-600/80 text-white shadow-sm shadow-emerald-900/40"
                  : "border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
              )}
            >
              <ShoppingBag className="size-[18px] shrink-0" />
              <span className={cn("flex-1", isCollapsed && "hidden")}>
                {t.nav.store}
              </span>
              {cartCount > 0 && (
                <button
                  onClick={(e) => { e.preventDefault(); openCart(true) }}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    isCollapsed ? "absolute -top-1 -right-1 bg-emerald-500 text-white" : "bg-white/20 text-white"
                  )}
                  title="Ver carrinho"
                >
                  {!isCollapsed && <ShoppingCart className="size-2.5" />}
                  {cartCount > 9 ? "9+" : cartCount}
                </button>
              )}
            </Link>

            {/* Bazar */}
            <Link
              href="/bazar"
              onClick={close}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/bazar")
                  ? "bg-amber-600/80 text-white shadow-sm shadow-amber-900/40"
                  : "border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
              )}
            >
              <Recycle className="size-[18px] shrink-0" />
              <span className={cn("flex-1", isCollapsed && "hidden")}>Bazar</span>
              {!isCollapsed && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  isActive("/bazar") ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-400"
                )}>
                  {t.nav.used}
                </span>
              )}
            </Link>

            {/* Ofertas */}
            <NavLink
              item={{ href: "/offers", label: t.nav.offers, icon: BadgePercent }}
              isActive={isActive("/offers")}
              collapsed={isCollapsed}
              onClick={close}
            />
          </div>
        </nav>

        {/* Changelog — visível apenas para admins; shimmer enquanto carrega */}
        {isAdminLoading ? (
          <div className="border-t border-border px-3 py-3">
            <div
              className={cn(
                "h-10 rounded-lg bg-muted/30 animate-pulse",
                isCollapsed ? "w-10 mx-auto" : "w-full"
              )}
            />
          </div>
        ) : isAdmin ? (
          <div className="border-t border-border px-3 py-3">
            <NavLink
              item={{ href: "/changelog", label: "Changelog", icon: Clock3 }}
              isActive={isActive("/changelog")}
              collapsed={isCollapsed}
              onClick={close}
            />
          </div>
        ) : null}

        {/* User */}
        <div className="border-t border-border px-3 py-2">
          <AuthUser isCollapsed={isCollapsed} loginHref="/login" variant="public" />
        </div>

        {/* Links legais — ocultos quando colapsado */}
        {!isCollapsed && (
          <div className="border-t border-border/50 px-3 py-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href="/privacidade"
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Privacidade
              </Link>
              <Link
                href="/termos"
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Termos
              </Link>
              <span className="text-[10px] text-muted-foreground/30">LGPD</span>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile toggle */}
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
