"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BadgePercent,
  BarChart2,
  BookOpen,
  Clock3,
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
  const { isMobileOpen, setMobileOpen } = useSidebar()
  // A sidebar pública sempre exibe os nomes; no desktop nunca recolhe para só ícones.
  const isCollapsed = false
  const pathname = usePathname()
  const { count: cartCount, setOpen: openCart } = useCart()

  const [claimableEvents, setClaimableEvents] = useState(0)

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
  // Loja e Bazar agora vivem na mesma rota (/loja?type=bazaar) — sem
  // useSearchParams aqui pra não forçar a sidebar (presente em toda página)
  // para client-side rendering. Ambos os itens ficam ativos juntos em /loja;
  // o filtro de tipo dentro da página é que reflete a seleção real.
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
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-60 shrink-0 flex-col border-border bg-background transition-all duration-300 md:relative md:inset-auto md:h-full md:w-60 md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
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
            {/* Mercado (Loja + Bazar) */}
            <Link
              href="/loja"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isLojaActive
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900/40"
                  : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/60 hover:bg-emerald-500/20 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
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

            {/* Promoções */}
            <Link
              href="/offers"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/offers")
                  ? "bg-orange-600 text-white shadow-sm shadow-orange-900/40"
                  : "nav-fire-holder border border-orange-500/40 bg-orange-500/10 hover:border-orange-500/60 hover:bg-orange-500/20"
              )}
            >
              <BadgePercent
                className={cn("size-[18px] shrink-0", !isActive("/offers") && "nav-fire-icon")}
              />
              <span className={cn(isCollapsed && "hidden", !isActive("/offers") && "nav-fire-text")}>
                {t.nav.offers}
              </span>
            </Link>
          </div>
        </nav>

        {/* Changelog — público */}
        <div className="border-t border-border px-3 py-3">
          <NavLink
            item={{ href: "/changelog", label: "Changelog", icon: Clock3 }}
            isActive={isActive("/changelog")}
            collapsed={isCollapsed}
            onClick={close}
          />
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
    </>
  )
}
