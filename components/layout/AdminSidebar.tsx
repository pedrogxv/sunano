"use client"

import { RouteLink } from "@/components/ui/route-link"
import { useRouter } from "next/navigation"
import { usePathname } from "@/lib/hooks/use-pathname"
import {
  AppWindow,
  BarChart2,
  BookOpen,
  ChevronDown,
  Crown,
  Eye,
  GalleryHorizontalEnd,
  Gift,
  Handshake,
  Home,
  Inbox,
  LifeBuoy,
  Medal,
  Sparkles,
  Megaphone,
  Star,
  MessageSquare,
  ShieldCheck,
  Mouse,
  Newspaper,
  Package,
  PanelTop,
  PartyPopper,
  PlaySquare,
  Receipt,
  Settings,
  ShoppingBag,
  Tag,
  Ticket,
  ToggleRight,
  Trophy,
  Users,
  Wrench,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { useSidebar } from "@/components/providers/sidebar-context"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { SIDEBAR_PANEL_TRANSITION, SidebarSectionLabel, SidebarTooltip, sidebarFade } from "@/components/layout/sidebar-motion"
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
  children?: NavItem[]
  /** Contador exibido como pill ao lado do label (chamados aguardando resposta, pedidos pagos, cadastros). */
  badgeCount?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Mesmos tokens da PublicSidebar: as duas sidebars são o mesmo painel de
// vidro, e item, seção e hover não podem divergir entre elas.
const NAV_ITEM_IDLE = "text-foreground/75 hover:bg-white/[0.07] hover:text-foreground"

/** Intervalo de atualização dos badges (pedidos pagos, suporte, cadastros). */
const BADGE_REFRESH_MS = 60_000

export function AdminSidebar() {
  const t = useT()
  const pathname = usePathname()
  const router = useRouter()
  const { adminCollapsed, isAdminMobileOpen, setAdminMobileOpen } = useSidebar()

  // Mesmo motivo do PublicSidebar: o colapso é do desktop, o drawer mobile é
  // sempre largo e não deve herdar o modo só-ícones.
  const isCollapsed = adminCollapsed && !isAdminMobileOpen

  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [expandedHref, setExpandedHref] = useState<string | null>(null)
  const [supportAwaitingCount, setSupportAwaitingCount] = useState(0)
  const [peripheralRequestsPendingCount, setPeripheralRequestsPendingCount] = useState(0)
  const [paidOrdersAwaitingCount, setPaidOrdersAwaitingCount] = useState(0)

  const navGroups: NavGroup[] = [
    {
      label: t.admin.sidebar.general,
      items: [
        { href: "/admin", label: "Dashboard", icon: Home, permission: "dashboard_read" },
        {
          href: "/admin/suporte",
          label: "Suporte",
          icon: LifeBuoy,
          children: [
            { href: "/admin/perifericos/pedidos", label: "Cadastros", icon: Inbox,  permission: "peripherals_read", badgeCount: peripheralRequestsPendingCount },
            { href: "/admin/suporte",             label: "Ticket",    icon: Ticket, permission: "support_read",     badgeCount: supportAwaitingCount },
          ],
        },
      ],
    },
    {
      label: t.admin.sidebar.peripherals,
      items: [
        { href: "/admin/tierlist",    label: "Tierlist",                       icon: Trophy,     permission: "peripherals_read" },
        { href: "/admin/perifericos", label: t.admin.sidebar.peripherals,      icon: Mouse,      permission: "peripherals_read" },
        { href: "/admin/ranking",     label: "Ranking",                        icon: BarChart2,  permission: "peripherals_read" },
        { href: "/admin/brands",      label: "Marcas",                         icon: Tag,        permission: "brands_read" },
        { href: "/admin/softwares",   label: "Softwares",                      icon: AppWindow,  permission: "brands_read" },
      ],
    },
    {
      label: t.admin.sidebar.content,
      items: [
        { href: "/admin/banners", label: "Banners da Home",             icon: GalleryHorizontalEnd, permission: "banners_read" },
        { href: "/admin/blog",   label: t.admin.sidebar.newsAndReviews, icon: Newspaper,     permission: "blog_read" },
        { href: "/admin/forum",  label: t.admin.sidebar.forum,          icon: MessageSquare, permission: "forum_read" },
        { href: "/admin/trust",  label: "Trust Factor",                 icon: ShieldCheck,   permission: "forum_read" },
        { href: "/admin/videos", label: "Vídeos",                       icon: PlaySquare },
        { href: "/admin/eventos", label: "Conquistas",                 icon: Medal,          permission: "events_read" },
        { href: "/admin/sorteios", label: "Sorteios",                  icon: PartyPopper,    requiresWebMaster: true },
        {
          href: "/admin/aura-itens",
          label: "Itens de Aura",
          icon: Sparkles,
          permission: "events_read",
          children: [
            { href: "/admin/aura-itens",         label: "Catálogo",              icon: Sparkles, permission: "events_read" },
            { href: "/admin/aura-itens/compras", label: "Histórico de compras",  icon: Receipt,  permission: "events_read" },
          ],
        },
      ],
    },
    {
      label: t.admin.sidebar.shop,
      items: [
        {
          href: "/admin/store",
          label: t.admin.sidebar.store,
          icon: ShoppingBag,
          permission: "store_read",
          children: [
            { href: "/admin/store",         label: "Produtos", icon: ShoppingBag,          permission: "store_read" },
            { href: "/admin/store/hero",    label: "Hero",     icon: PanelTop,             permission: "store_read" },
            { href: "/admin/store/commerce-bar", label: "Barra comercial", icon: Megaphone, permission: "store_read" },
            { href: "/admin/store/avaliacoes", label: "Avaliações", icon: Star, permission: "store_read" },
            { href: "/admin/store/banners", label: "Banners",  icon: GalleryHorizontalEnd, permission: "store_read" },
            { href: "/admin/store/orders",  label: "Pedidos",  icon: Package,              permission: "store_read", badgeCount: paidOrdersAwaitingCount },
          ],
        },
        { href: "/admin/vips",   label: "VIPs",                         icon: Crown,       permission: "vip_read" },
        {
          href: "/admin/afiliados",
          label: "Afiliados",
          icon: Handshake,
          permission: "affiliates_read",
          children: [
            { href: "/admin/afiliados",           label: "Solicitações", icon: Handshake, permission: "affiliates_read" },
            { href: "/admin/afiliados/saques",    label: "Saques",       icon: Package,   permission: "affiliates_read" },
            { href: "/admin/afiliados/comissoes", label: "Comissões",    icon: BarChart2, permission: "affiliates_read" },
            { href: "/admin/indicacoes",          label: "Indicações",   icon: Gift,      permission: "affiliates_read" },
          ],
        },
      ],
    },
    {
      label: t.admin.sidebar.system,
      items: [
        {
          href: "/admin/users",
          label: t.admin.sidebar.system,
          icon: Wrench,
          children: [
            { href: "/admin/users",        label: t.admin.sidebar.users,    icon: Users,     requiresWebMaster: true },
            { href: "/admin/notificacoes", label: "Avisos do sistema",      icon: Megaphone, requiresWebMaster: true },
            { href: "/admin/feature-flags", label: "Feature flags",         icon: ToggleRight, requiresWebMaster: true },
            { href: "/admin/settings",     label: t.admin.sidebar.settings, icon: Settings,  permission: "settings_read" },
          ],
        },
      ],
    },
  ]

  // Último total de pedidos pagos visto, para avisar quando entra um novo.
  // `null` até a primeira carga: abrir o painel com pedidos já pendentes não
  // é "novo pedido", o badge basta.
  const lastPaidOrdersCount = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadProfile(initial: boolean) {
      try {
        const res = await fetch("/api/admin/profile")
        if (!res.ok) {
          // Só a primeira carga decide o menu. Uma falha de refresh não pode
          // esconder a sidebar inteira de quem já está usando o painel.
          if (mounted && initial) { setProfile(null); setIsLoadingProfile(false) }
          return
        }
        const data = (await res.json().catch(() => null)) as
          | {
              profile?: AdminProfile
              supportAwaitingCount?: number
              peripheralRequestsPendingCount?: number
              paidOrdersAwaitingCount?: number
            }
          | null
        if (!mounted) return
        setProfile(data?.profile ?? null)
        setSupportAwaitingCount(data?.supportAwaitingCount ?? 0)
        setPeripheralRequestsPendingCount(data?.peripheralRequestsPendingCount ?? 0)

        const paidCount = data?.paidOrdersAwaitingCount ?? 0
        const previous = lastPaidOrdersCount.current
        if (previous !== null && paidCount > previous) {
          const added = paidCount - previous
          toast.success(added === 1 ? "Novo pedido pago" : `${added} novos pedidos pagos`, {
            description: "Confira em Loja › Pedidos.",
            action: { label: "Ver pedidos", onClick: () => router.push("/admin/store/orders") },
            duration: 10_000,
          })
        }
        lastPaidOrdersCount.current = paidCount
        setPaidOrdersAwaitingCount(paidCount)
      } catch {
        if (mounted && initial) setProfile(null)
      } finally {
        if (mounted && initial) setIsLoadingProfile(false)
      }
    }
    loadProfile(true)

    // Pagamento chega por webhook, sem ninguém no painel ter feito nada: sem
    // reconsultar, o badge só mudava ao recarregar a página, e a venda era
    // descoberta quando o cliente abria o suporte. Aba em segundo plano não
    // consulta; ao voltar para ela, atualiza na hora.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadProfile(false)
    }, BADGE_REFRESH_MS)
    function onVisible() {
      if (document.visibilityState === "visible") loadProfile(false)
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      mounted = false
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href)
  }

  /** Rota ativa dentre os filhos — usada tanto para abrir o grupo quanto para destacar o filho certo. */
  const activeChildHref = (children: NavItem[]) => {
    // Ordena pelo href mais específico primeiro (evita /admin/store "vencer" /admin/store/orders).
    const sorted = [...children].sort((a, b) => b.href.length - a.href.length)
    return sorted.find((child) => isActive(child.href))?.href ?? null
  }

  const allHrefs = navGroups.flatMap((group) =>
    group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)])
  )

  function canSee(item: NavItem) {
    if (item.requiresWebMaster) return isWebMaster(profile)
    if (!item.permission) return true
    return hasAdminPermission(profile, item.permission)
  }

  function filterItems(items: NavItem[]) {
    if (!profile) return []
    return items
      .filter(canSee)
      .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item))
      .filter((item) => !item.children || item.children.length > 0)
  }

  const close = () => setAdminMobileOpen(false)

  return (
    <>
      {/* Mobile overlay */}
      {isAdminMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-64 shrink-0 flex-col md:relative md:inset-auto md:h-full md:translate-x-0",
          SIDEBAR_PANEL_TRANSITION,
          // Mesmo painel de vidro flutuante da PublicSidebar (`.sidebar-glass`
          // em globals.css); `overflow-hidden` recorta a rolagem no raio.
          "sidebar-glass overflow-hidden rounded-r-2xl border border-l-0 border-white/10 md:rounded-2xl md:border-l",
          // Gaveta fechada no celular sai da pintura e do Tab.
          isAdminMobileOpen ? "translate-x-0" : "-translate-x-full max-md:invisible",
          isCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Mesma geometria da PublicSidebar (ver o comentário lá): o ícone
            fica parado no centro dos 64px e só a largura anima. */}
        <nav
          className={cn(
            "sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pt-6 pb-6",
            isCollapsed && "sidebar-scroll-hidden"
          )}
        >
          {/* Brand: wordmark e mascote empilhados, trocando só de opacidade */}
          <RouteLink href="/admin" onClick={close} className="relative mb-6 flex h-9 items-center pl-[3px]">
            <span
              className={cn(
                "flex shrink-0 items-center gap-2.5 transition-opacity ease-out motion-reduce:transition-none",
                isCollapsed ? "opacity-0 duration-150" : "opacity-100 delay-100 duration-200"
              )}
            >
              {/* Mesmo wordmark da PublicSidebar (ver o comentário lá sobre o
                  WebP), um degrau menor para caber o selo do painel. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/mascot/logo-wordmark.webp"
                alt="Sunano Admin"
                width={606}
                height={108}
                className="h-7 w-auto max-w-none shrink-0 object-contain"
              />
              <span className="rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Admin
              </span>
            </span>
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

          {isLoadingProfile ? (
            // Espelha: Geral(2), Periféricos(3), Conteúdo(2), Loja(2), Sistema(2), Ações(1)
            <div>
              {[2, 3, 2, 2, 2, 1].map((count, gi) => (
                <div key={gi}>
                  <div className="mb-1.5 mt-5 flex h-4 items-end px-3">
                    <div className={cn("h-2.5 rounded bg-white/[0.07] animate-pulse", isCollapsed ? "w-[18px]" : "w-14")} />
                  </div>
                  <div className="space-y-1">
                    {Array.from({ length: count }).map((_, ii) => (
                      <div
                        key={ii}
                        className={cn(
                          "h-10 w-full rounded-lg bg-white/[0.06] animate-pulse"
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            navGroups.map((group) => {
              const visible = filterItems(group.items)
              if (visible.length === 0) return null
              return (
                <div key={group.label}>
                  <SidebarSectionLabel label={group.label} collapsed={isCollapsed} />
                  <div className="space-y-1">
                    {visible.map((item) => {
                      const Icon = item.icon

                      if (item.children && item.children.length > 0) {
                        const activeChild = activeChildHref(item.children)
                        const open = expandedHref === item.href || activeChild !== null
                        const childrenBadgeCount = item.children.reduce((sum, child) => sum + (child.badgeCount ?? 0), 0)

                        return (
                          <div key={item.href} className="relative">
                            <SidebarTooltip label={item.label} collapsed={isCollapsed} count={childrenBadgeCount}>
                              <button
                                type="button"
                                onClick={() => setExpandedHref((prev) => (prev === item.href ? null : item.href))}
                                aria-expanded={open}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                  activeChild ? "text-foreground" : NAV_ITEM_IDLE
                                )}
                              >
                                <Icon className="size-[18px] shrink-0" />
                                <span className={cn("flex flex-1 items-center gap-3", sidebarFade(isCollapsed))}>
                                  <span className="flex-1 text-left">{item.label}</span>
                                  {Boolean(childrenBadgeCount) && (
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                                      {childrenBadgeCount}
                                    </span>
                                  )}
                                  <ChevronDown
                                    className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
                                  />
                                </span>
                                {/* Fechada, a contagem vira um ponto no canto do
                                    ícone: o rótulo (e a pílula dentro dele) esmaeceu */}
                                {Boolean(childrenBadgeCount) && (
                                  <span
                                    className={cn(
                                      "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-semibold text-white transition-[opacity,scale] duration-200 motion-reduce:transition-none",
                                      isCollapsed ? "scale-100 opacity-100 delay-100" : "pointer-events-none scale-50 opacity-0"
                                    )}
                                  >
                                    {childrenBadgeCount}
                                  </span>
                                )}
                              </button>
                            </SidebarTooltip>
                            {/* Fechada, os filhos recolhem pela mesma grade
                                que abre/fecha o grupo, em vez de sumirem */}
                            <div
                              className={cn(
                                "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                                isCollapsed && "pointer-events-none opacity-0"
                              )}
                              style={{ gridTemplateRows: open && !isCollapsed ? "1fr" : "0fr" }}
                              inert={isCollapsed || !open}
                            >
                              <div className="min-h-0">
                                <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                                  {item.children.map((child) => {
                                    const ChildIcon = child.icon
                                    const childActiveState = child.href === activeChild
                                    return (
                                      <RouteLink
                                        key={child.href}
                                        href={child.href}
                                        onClick={close}
                                        className={cn(
                                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                          childActiveState ? "bg-primary text-primary-foreground" : NAV_ITEM_IDLE
                                        )}
                                      >
                                        <ChildIcon className="size-4 shrink-0" />
                                        <span className="flex-1">{child.label}</span>
                                        {Boolean(child.badgeCount) && (
                                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                                            {child.badgeCount}
                                          </span>
                                        )}
                                      </RouteLink>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      }

                      // "/admin/perifericos" é prefixo de "/admin/perifericos/pedidos"
                      // (Cadastros, dentro de Suporte): sem isto, Periféricos acende
                      // junto na fila de pedidos. Confere o menu inteiro, filhos
                      // inclusive, porque o item mais específico mora em outro grupo.
                      const active =
                        isActive(item.href) &&
                        !allHrefs.some((href) => href.length > item.href.length && isActive(href))
                      return (
                        <SidebarTooltip key={item.href} label={item.label} collapsed={isCollapsed} count={item.badgeCount}>
                          <RouteLink
                            href={item.href}
                            onClick={close}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                              active ? "bg-primary text-primary-foreground" : NAV_ITEM_IDLE
                            )}
                          >
                            <Icon className="size-[18px] shrink-0" />
                            <span className={cn("flex flex-1 items-center gap-3", sidebarFade(isCollapsed))}>
                              <span className="flex-1">{item.label}</span>
                              {Boolean(item.badgeCount) && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                                  {item.badgeCount}
                                </span>
                              )}
                            </span>
                          </RouteLink>
                        </SidebarTooltip>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}

          {/* Ver site */}
          {!isLoadingProfile && (
            <>
              <SidebarSectionLabel label={t.admin.sidebar.actions} collapsed={isCollapsed} />
              <SidebarTooltip label={t.admin.sidebar.viewSite} collapsed={isCollapsed}>
                <RouteLink
                  href="/"
                  onClick={close}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    NAV_ITEM_IDLE
                  )}
                >
                  <Eye className="size-[18px] shrink-0" />
                  <span className={sidebarFade(isCollapsed)}>{t.admin.sidebar.viewSite}</span>
                </RouteLink>
              </SidebarTooltip>
            </>
          )}
        </nav>
      </aside>
    </>
  )
}
