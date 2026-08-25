"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgePercent,
  BarChart2,
  BookOpen,
  Clock3,
  Crown,
  Flame,
  Home,
  Medal,
  MessageCircle,
  Mouse,
  Newspaper,
  PlaySquare,
  ShoppingBag,
  ShoppingCart,
  Trophy,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"

import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useCart } from "@/components/providers/cart-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  /** Contador exibido como tag ao lado do label — hoje só "Eventos" usa (conquistas resgatáveis). */
  badge?: number
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-border" />
  return (
    <p className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
          : "text-foreground/75 hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className={cn("flex-1", collapsed && "hidden")}>{item.label}</span>
      {!collapsed && !!item.badge && item.badge > 0 && (
        <span
          className={cn(
            "flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            isActive ? "bg-primary-foreground/25 text-primary-foreground" : "bg-primary text-primary-foreground"
          )}
        >
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
    </Link>
  )
}

export function PublicSidebar() {
  const t = useT()
  const { publicCollapsed: isCollapsed, isMobileOpen, setMobileOpen } = useSidebar()
  const pathname = usePathname()
  const { count: cartCount, setOpen: openCart } = useCart()
  const { user: authUser } = useAuthUser()
  const { openLogin } = useAuthModal()

  const [claimableEvents, setClaimableEvents] = useState(0)
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch("/api/conquistas/resgataveis")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { count?: number } | null) => { if (mounted) setClaimableEvents(data?.count ?? 0) })
      .catch(() => { if (mounted) setClaimableEvents(0) })
    return () => { mounted = false }
  }, [])

  const close = () => setMobileOpen(false)
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href)
  const isLojaActive = isActive("/loja")

  const peripheralItems: NavItem[] = [
    { href: "/tierlist",    label: "Tierlist",           icon: Trophy },
    { href: "/perifericos", label: t.nav.peripherals,    icon: Mouse },
    { href: "/ranking",     label: "Ranking",            icon: BarChart2 },
  ]

  const contentItems: NavItem[] = [
    { href: "/noticias", label: t.nav.news,    icon: Newspaper },
    { href: "/forum",    label: t.nav.forum,   icon: MessageCircle },
    { href: "/videos",   label: t.nav.videos,  icon: PlaySquare },
    { href: "/pessoas",  label: t.nav.people,  icon: Users },
    { href: "/conquistas", label: t.nav.events, icon: Medal, badge: claimableEvents },
    { href: "/blog",     label: "Guias",       icon: BookOpen },
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
          // h-dvh e não h-screen: 100vh é o viewport *sem* a barra de URL do navegador
          // mobile, o que empurra o rodapé (Changelog, links legais) para fora da tela.
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-60 shrink-0 flex-col border-border bg-background transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-6 pb-4">
          {/* Brand */}
          <Link
            href="/"
            onClick={close}
            className={cn(
              "flex pb-6",
              isCollapsed ? "justify-center" : "items-center"
            )}
          >
            {isCollapsed ? (
              <SunanoIcon />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/images/mascot/logo-wordmark.png"
                alt="Sunano Tierlist"
                className="h-9 w-auto shrink-0 object-contain"
              />
            )}
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

          {/* Mercado */}
          <SectionLabel label={t.nav.shop} collapsed={isCollapsed} />
          <div className="space-y-1">
            {/* Loja */}
            <Link
              href="/loja"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isLojaActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/75 hover:bg-muted hover:text-foreground"
              )}
            >
              <ShoppingBag
                className={cn("size-[18px] shrink-0", !isLojaActive && "text-emerald-600 dark:text-emerald-400")}
              />
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

            {/* Promoções */}
            <Link
              href="/offers"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/offers")
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/75 hover:bg-muted hover:text-foreground"
              )}
            >
              <BadgePercent
                className={cn("size-[18px] shrink-0", !isActive("/offers") && "nav-bolt-icon")}
              />
              <span className={cn("flex-1", isCollapsed && "hidden")}>
                {t.nav.offers}
              </span>
            </Link>

            {/* Central de Aura */}
            <Link
              href="/aura"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/aura")
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/75 hover:bg-muted hover:text-foreground"
              )}
            >
              <Flame
                className={cn("size-[18px] shrink-0", !isActive("/aura") && "nav-fire-icon")}
                fill={isActive("/aura") ? "currentColor" : "none"}
              />
              <span className={cn("flex-1", isCollapsed && "hidden")}>
                Central de Aura
              </span>
            </Link>
          </div>
        </nav>

        {/* Changelog para quem já é VIP — quem não é vê um convite pra virar VIP no lugar. */}
        <div className="border-t border-border px-3 py-3">
          {authUser?.isVip ? (
            <NavLink
              item={{ href: "/changelog", label: "Changelog", icon: Clock3 }}
              isActive={isActive("/changelog")}
              collapsed={isCollapsed}
              onClick={close}
            />
          ) : isVipSubscriptionEnabled() ? (
            <button
              type="button"
              onClick={() => {
                close()
                if (authUser) setVipUpsellOpen(true)
                else openLogin()
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border border-[var(--vip-accent-soft)] px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--vip-accent-soft)]",
                isCollapsed && "justify-center"
              )}
              style={{ color: "var(--vip-accent)" }}
            >
              <Crown className="size-[18px] shrink-0 vip-badge-crown" />
              <span className={cn("flex-1 text-left", isCollapsed && "hidden")}>Vire VIP</span>
            </button>
          ) : (
            <NavLink
              item={{ href: "/changelog", label: "Changelog", icon: Clock3 }}
              isActive={isActive("/changelog")}
              collapsed={isCollapsed}
              onClick={close}
            />
          )}
        </div>

        {/* Links legais — ocultos quando colapsado */}
        {!isCollapsed && (
          <div className="border-t border-border px-3 py-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href="/privacidade"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacidade
              </Link>
              <Link
                href="/termos"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Termos
              </Link>
              <Link
                href="/trocas-e-devolucoes"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Trocas e Devoluções
              </Link>
              <Link
                href="/quem-somos"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Quem Somos
              </Link>
              <span className="text-[11px] text-muted-foreground">LGPD</span>
            </div>
          </div>
        )}
      </aside>

      <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </>
  )
}
