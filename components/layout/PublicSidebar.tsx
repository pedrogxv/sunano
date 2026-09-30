"use client"

import { RouteLink } from "@/components/ui/route-link"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import {
  AppWindow,
  BadgePercent,
  BarChart2,
  BookOpen,
  Crown,
  Home,
  Info,
  Medal,
  MessageCircle,
  Mouse,
  Newspaper,
  PlaySquare,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react"
import { AuraIcon } from "@/components/ui/AuraIcon"
import { useEffect, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { vipCtaLabel } from "@/lib/vip-status"
import { useAuthUser } from "@/components/providers/auth-context"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useCart } from "@/components/providers/cart-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

// Mesmo motivo de antes na TopBar: o painel busca os próprios endpoints e só
// interessa a quem tem conta. Fora do bundle crítico das páginas públicas.
const AuraMissionsBadge = dynamic(
  () => import("@/components/layout/AuraMissionsBadge").then((m) => m.AuraMissionsBadge),
  { ssr: false, loading: () => <Skeleton className="h-14 w-full rounded-xl" /> }
)

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
    <RouteLink
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
    </RouteLink>
  )
}

export function PublicSidebar() {
  const t = useT()
  const { publicCollapsed, isMobileOpen, setMobileOpen } = useSidebar()

  // `publicCollapsed` é o estado do *desktop* (largura md:w-16). O drawer mobile
  // é sempre largo, então renderizar seu conteúdo colapsado deixava só os ícones
  // num painel de 240px. No mobile aberto, o colapso nunca se aplica.
  const isCollapsed = publicCollapsed && !isMobileOpen
  const pathname = usePathname()
  const { count: cartCount, setOpen: openCart } = useCart()
  const { user: authUser } = useAuthUser()

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

  const latestVersion = t.changelog.entries[0]?.version

  const close = () => setMobileOpen(false)
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href)
  const isLojaActive = isActive("/loja")

  const peripheralItems: NavItem[] = [
    { href: "/tierlist",    label: "Tierlist",           icon: Trophy },
    { href: "/perifericos", label: t.nav.peripherals,    icon: Mouse },
    { href: "/softwares",   label: t.nav.softwares,      icon: AppWindow },
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
          // mobile, o que empurra o rodapé (painel de Aura, Patch Notes) para fora
          // da tela.
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-60 shrink-0 flex-col border-border bg-background transition-all duration-300 md:relative md:inset-auto md:h-full md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-6 pb-6">
          {/* Brand */}
          <RouteLink
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
          </RouteLink>

          {/* Início + Loja + Promoções. A Loja e as Promoções são os destinos que
              levam a pessoa a comprar: ficam logo abaixo do Início, antes de
              qualquer seção, e não no fim de Periféricos onde ninguém rolava até lá. */}
          <div className="space-y-1">
            {/* Início */}
            <NavLink
              item={{ href: "/", label: t.nav.home, icon: Home }}
              isActive={pathname === "/"}
              collapsed={isCollapsed}
              onClick={close}
            />

            {/* Loja */}
            <RouteLink
              href="/loja"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isLojaActive
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900/40"
                  : "nav-bag-holder border border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500/60 hover:bg-emerald-500/20"
              )}
            >
              <ShoppingBag
                className={cn("size-[18px] shrink-0", !isLojaActive && "nav-bag-icon")}
              />
              <span className={cn("flex-1", isCollapsed && "hidden", !isLojaActive && "nav-bag-text")}>
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
            </RouteLink>

            {/* Promoções */}
            <RouteLink
              href="/offers"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/offers")
                  ? "bg-sky-600 text-white shadow-sm shadow-sky-900/40"
                  : "nav-bolt-holder border border-sky-500/40 bg-sky-500/10 hover:border-sky-500/60 hover:bg-sky-500/20"
              )}
            >
              <BadgePercent
                className={cn("size-[18px] shrink-0", !isActive("/offers") && "nav-bolt-icon")}
              />
              <span className={cn(isCollapsed && "hidden", !isActive("/offers") && "nav-bolt-text")}>
                {t.nav.offers}
              </span>
            </RouteLink>

            {/* Hub dos documentos legais/institucionais. Um link só; as
                páginas individuais seguem em suas URLs próprias. */}
            <NavLink
              item={{ href: "/informacoes", label: t.nav.info, icon: Info }}
              isActive={isActive("/informacoes")}
              collapsed={isCollapsed}
              onClick={close}
            />
          </div>

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

            {/* Convite VIP para quem NÃO é VIP AGORA (`isVip`, não "tem
                assinatura viva": quem cancelou dentro do período pago continua
                VIP até o fim dele). Ver lib/vip-status.ts. */}
            {!authUser?.vip.isVip && isVipSubscriptionEnabled() && (
              <button
                type="button"
                onClick={() => {
                  close()
                  // Deslogado também abre a OFERTA, não o login: o popup se
                  // apresenta no modo de visitante (vantagens + "Entrar"/"Criar
                  // conta") e retoma a assinatura sozinho depois. Mandar direto
                  // para o login perdia o motivo do clique — a pessoa
                  // autenticava e caía no fórum, sem nada sobre VIP.
                  setVipUpsellOpen(true)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border border-[var(--vip-accent-soft)] px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--vip-accent-soft)]",
                  isCollapsed && "justify-center"
                )}
                style={{ color: "var(--vip-accent)" }}
              >
                <Crown className="size-[18px] shrink-0 vip-badge-crown" />
                <span className={cn("flex-1 text-left", isCollapsed && "hidden")}>
                  {/* Visitante deslogado não tem estado: o convite é o genérico. */}
                  {authUser ? vipCtaLabel(authUser.vip) ?? "Seja VIP" : "Seja VIP"}
                </span>
              </button>
            )}
          </div>
        </nav>

        {/* Rodapé fixo: painel de Aura (saldo + nível + missões, que saiu da
            TopBar) e, por último, Patch Notes numa linha discreta. Fica fora
            da rolagem para o saldo estar sempre à vista. Deslogado não tem
            saldo: a Central aparece como link comum. */}
        <div className="shrink-0 space-y-1 border-t border-border px-3 pt-3 pb-3">
          {authUser ? (
            <AuraMissionsBadge collapsed={isCollapsed} active={!!isActive("/aura")} onNavigate={close} />
          ) : (
            <RouteLink
              href="/aura"
              onClick={close}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isCollapsed && "justify-center",
                isActive("/aura")
                  ? "bg-orange-600 text-white shadow-sm shadow-orange-900/40"
                  : "nav-fire-holder border border-orange-500/40 bg-orange-500/10 hover:border-orange-500/60 hover:bg-orange-500/20"
              )}
            >
              <AuraIcon
                tone="inherit"
                outline={!isActive("/aura")}
                className={cn("size-[18px] shrink-0", !isActive("/aura") && "nav-fire-icon")}
              />
              <span className={cn(isCollapsed && "hidden", !isActive("/aura") && "nav-fire-text")}>
                Central de Aura
              </span>
            </RouteLink>
          )}

          <RouteLink
            href="/changelog"
            onClick={close}
            title={isCollapsed ? t.nav.patchNotes : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
              isCollapsed && "justify-center px-0",
              isActive("/changelog") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="size-3.5 shrink-0" />
            <span className={cn(isCollapsed && "hidden")}>{t.nav.patchNotes}</span>
            {latestVersion && (
              <span className={cn("ml-auto tabular-nums opacity-70", isCollapsed && "hidden")}>
                {latestVersion}
              </span>
            )}
          </RouteLink>
        </div>
      </aside>

      <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </>
  )
}
