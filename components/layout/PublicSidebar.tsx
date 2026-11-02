"use client"

import { RouteLink } from "@/components/ui/route-link"
import dynamic from "next/dynamic"
import { usePathname } from "@/lib/hooks/use-pathname"
import {
  AppWindow,
  BadgePercent,
  BarChart2,
  BookOpen,
  Home,
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
import { AuraFlame } from "@/components/ui/AuraFlame"
import { useEffect, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { SidebarVipTab } from "@/components/layout/SidebarVipTab"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { vipCtaLabel } from "@/lib/vip-status"
import { useAuthUser } from "@/components/providers/auth-context"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useCart } from "@/components/providers/cart-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { fetchRedeemableEvents } from "@/lib/client/redeemable-events"
import { SIDEBAR_PANEL_TRANSITION, SidebarSectionLabel, SidebarTooltip, sidebarFade } from "@/components/layout/sidebar-motion"

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
    <SidebarTooltip label={item.label} collapsed={collapsed} count={item.badge}>
      <RouteLink
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-foreground/75 hover:bg-white/[0.07] hover:text-foreground"
        )}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className={cn("flex flex-1 items-center gap-3", sidebarFade(collapsed))}>
          <span className="flex-1">{item.label}</span>
          {!!item.badge && item.badge > 0 && (
            <span
              className={cn(
                "flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                isActive ? "bg-primary-foreground/25 text-primary-foreground" : "bg-primary text-primary-foreground"
              )}
            >
              {item.badge > 9 ? "9+" : item.badge}
            </span>
          )}
        </span>
      </RouteLink>
    </SidebarTooltip>
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
  const showVipTab = !authUser?.vip.isVip && isVipSubscriptionEnabled()

  useEffect(() => {
    let mounted = true
    void fetchRedeemableEvents().then((data) => {
      if (mounted) setClaimableEvents(data?.count ?? 0)
    })
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
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-60 shrink-0 flex-col md:relative md:inset-auto md:h-full md:translate-x-0",
          // Vidro (estilo macOS): painel flutuante, material em `.sidebar-glass`
          // (globals.css). `overflow-hidden` recorta a rolagem do <nav> no
          // raio do painel.
          "sidebar-glass overflow-hidden rounded-r-2xl border border-l-0 border-white/10 md:rounded-2xl md:border-l",
          SIDEBAR_PANEL_TRANSITION,
          // Gaveta fechada no celular: fora da tela, mas antes seguia pintando
          // os destaques em loop (Loja/Promoções/Aura animam background-position
          // e drop-shadow, que não rodam no compositor) a cada frame, o tempo
          // todo — custo direto no INP. `invisible` tira da pintura e do Tab
          // (a transição de `visibility` mantém visível durante o slide de saída) e
          // `.sidebar-drawer-closed` pausa as animações (globals.css).
          isMobileOpen ? "translate-x-0" : "-translate-x-full max-md:invisible sidebar-drawer-closed",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        {/* Geometria do colapso: `px-2.5` aqui + `px-3` no item põem o centro
            do ícone de 18px exatamente no meio dos 64px do painel fechado. O
            ícone NÃO troca de posição entre os estados (antes o item virava
            `justify-center` e o ícone pulava); item com borda ou ícone de
            outro tamanho compensa no próprio padding. */}
        <nav
          className={cn(
            "sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pt-6 pb-6",
            isCollapsed && "sidebar-scroll-hidden"
          )}
        >
          {/* Brand: o wordmark já abre com o mascote, então os dois ficam
              empilhados no mesmo ponto e só trocam de opacidade. Fechando, o
              texto esmaece e o mascote fica; não há troca de elemento. */}
          <RouteLink href="/" onClick={close} className="relative mb-6 flex h-9 items-center pl-[3px]">
            {/* WebP reduzido (606×108, 3x do h-9). O PNG original tem
                14285×2546 px / 464 KB: no celular a decodificação dele
                travava a primeira pintura. O PNG fica em /public porque o
                card de /api/og lê o arquivo (Satori não lê WebP). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/mascot/logo-wordmark.webp"
              alt="Sunano Tierlist"
              width={606}
              height={108}
              className={cn(
                "h-9 w-auto max-w-none shrink-0 object-contain transition-opacity ease-out motion-reduce:transition-none",
                isCollapsed ? "opacity-0 duration-150" : "opacity-100 delay-100 duration-200"
              )}
            />
            <span
              aria-hidden
              className={cn(
                "absolute left-[3px] top-0 transition-opacity ease-out motion-reduce:transition-none",
                isCollapsed ? "opacity-100 duration-150" : "opacity-0 delay-100 duration-200"
              )}
            >
              <SunanoIcon />
            </span>
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
            <SidebarTooltip label={t.nav.store} collapsed={isCollapsed}>
              <RouteLink
                href="/loja"
                onClick={close}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-[11px] py-2.5 text-sm font-medium transition-colors",
                  isLojaActive
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900/40"
                    : "nav-bag-holder border border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500/60 hover:bg-emerald-500/20"
                )}
              >
                <ShoppingBag
                  className={cn("size-[18px] shrink-0", !isLojaActive && "nav-bag-icon")}
                />
                <span className={cn("flex-1", sidebarFade(isCollapsed))}>
                  <span className={cn(!isLojaActive && "nav-bag-text")}>{t.nav.store}</span>
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
            </SidebarTooltip>

            {/* Promoções */}
            <SidebarTooltip label={t.nav.offers} collapsed={isCollapsed}>
              <RouteLink
                href="/offers"
                onClick={close}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-[11px] py-2.5 text-sm font-medium transition-colors",
                  isActive("/offers")
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-900/40"
                    : "nav-bolt-holder border border-sky-500/40 bg-sky-500/10 hover:border-sky-500/60 hover:bg-sky-500/20"
                )}
              >
                <BadgePercent
                  className={cn("size-[18px] shrink-0", !isActive("/offers") && "nav-bolt-icon")}
                />
                <span className={sidebarFade(isCollapsed)}>
                  <span className={cn(!isActive("/offers") && "nav-bolt-text")}>{t.nav.offers}</span>
                </span>
              </RouteLink>
            </SidebarTooltip>
          </div>

          {/* Periféricos */}
          <SidebarSectionLabel label={t.nav.peripherals} collapsed={isCollapsed} />
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
          <SidebarSectionLabel label={t.nav.content} collapsed={isCollapsed} />
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
        </nav>

        {/* Rodapé fixo: painel de Aura (saldo + nível + missões, que saiu da
            TopBar) e, por último, Patch Notes numa linha discreta. Fica fora
            da rolagem para o saldo estar sempre à vista. Deslogado não tem
            saldo: a Central aparece como link comum. */}
        <div className="shrink-0 space-y-1 border-t border-white/10 px-2.5 pt-3 pb-3">
          {/* Convite VIP para quem NÃO é VIP AGORA (`isVip`, não "tem
              assinatura viva": quem cancelou dentro do período pago continua
              VIP até o fim dele). Ver lib/vip-status.ts. Encaixa no topo da
              Central de Aura e os dois viram um bloco só. Deslogado também
              abre a OFERTA, não o login: o popup se apresenta no modo de
              visitante e retoma a assinatura sozinho depois. */}
          <div>
          {showVipTab && (
            <SidebarVipTab
              collapsed={isCollapsed}
              // Visitante deslogado não tem estado: o convite é o genérico.
              label={authUser ? vipCtaLabel(authUser.vip) ?? "Seja VIP" : "Seja VIP"}
              onClick={() => {
                close()
                setVipUpsellOpen(true)
              }}
            />
          )}
          {authUser ? (
            <AuraMissionsBadge
              collapsed={isCollapsed}
              active={!!isActive("/aura")}
              attached={showVipTab}
              onNavigate={close}
            />
          ) : (
            <SidebarTooltip label="Central de Aura" collapsed={isCollapsed}>
              <RouteLink
                href="/aura"
                onClick={close}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors",
                  showVipTab && "rounded-b-xl rounded-t-none border-t-0",
                  isActive("/aura")
                    ? "bg-orange-600 text-white shadow-sm shadow-orange-900/40"
                    : "nav-fire-holder border border-orange-500/40 bg-orange-500/10 hover:border-orange-500/60 hover:bg-orange-500/20"
                )}
              >
                {/* A MESMA chama viva do card logado (`AuraMissionsBadge`):
                    deslogado e logado não podem mostrar dois símbolos. */}
                <AuraFlame size="lg" className="shrink-0" />
                <span className={sidebarFade(isCollapsed)}>
                  <span className={cn(!isActive("/aura") && "nav-fire-text")}>Central de Aura</span>
                </span>
              </RouteLink>
            </SidebarTooltip>
          )}
          </div>

          <SidebarTooltip label={t.nav.patchNotes} collapsed={isCollapsed}>
            <RouteLink
              href="/changelog"
              onClick={close}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs transition-colors",
                isActive("/changelog") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="size-3.5 shrink-0" />
              <span className={cn("flex flex-1 items-center", sidebarFade(isCollapsed))}>
                {t.nav.patchNotes}
                {latestVersion && (
                  // Sem `opacity-70`: em cima do `text-muted-foreground` ela
                  // derrubava o contraste abaixo de 4,5:1 (Lighthouse).
                  <span className="ml-auto tabular-nums">{latestVersion}</span>
                )}
              </span>
            </RouteLink>
          </SidebarTooltip>
        </div>
      </aside>

      <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </>
  )
}
