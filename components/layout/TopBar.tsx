"use client"

import { PanelLeft } from "lucide-react"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// Code-split: o AuthUser puxa o cliente Supabase (@supabase/ssr), pesado e
// desnecessário para a primeira pintura. Carregá-lo sob demanda tira esse
// peso do bundle crítico de TODAS as páginas públicas. O placeholder abaixo
// é idêntico ao esqueleto que o próprio AuthUser exibe enquanto checa a sessão,
// então não há mudança visual nem layout shift.
const AuthUser = dynamic(
  () => import("@/components/auth/auth-user").then((m) => m.AuthUser),
  {
    ssr: false,
    loading: () => <Skeleton className="size-8 shrink-0 rounded-lg md:size-8" />,
  }
)
// Mesmo motivo do AuthUser: o sino só interessa a quem está logado e puxa
// date-fns + popover. Fora do bundle crítico das páginas públicas. Ele já
// se esconde sozinho quando não há sessão, então o placeholder é vazio.
const NotificationBell = dynamic(
  () => import("@/components/notifications/notification-bell").then((m) => m.NotificationBell),
  { ssr: false }
)
// Idem: Aura + missões diárias só existem pra quem tem conta e buscam seus
// próprios endpoints. Também se esconde sozinho.
const AuraMissionsBadge = dynamic(
  () => import("@/components/layout/AuraMissionsBadge").then((m) => m.AuraMissionsBadge),
  { ssr: false }
)
import { useSidebar } from "@/components/providers/sidebar-context"
import { usePageHeaderState } from "@/components/providers/page-header-context"
import { CartButton } from "@/components/store/CartDrawer"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

type PageDefaults = { title: string; description?: string }

/**
 * Títulos das rotas do painel. Ficam como literal em pt-BR de propósito: o
 * admin não é traduzido (o seletor de idioma nem aparece lá — ver TopBar).
 */
const ADMIN_PAGE_DEFAULTS: Record<string, PageDefaults> = {
  "/admin":             { title: "Dashboard", description: "Visão geral do painel administrativo." },
  "/admin/tierlist":    { title: "Admin Tierlist", description: "Arraste e solte para reorganizar. Clique para editar." },
  "/admin/perifericos": { title: "Periféricos", description: "Gerencie a wiki de periféricos." },
  "/admin/blog":        { title: "Blog & Reviews", description: "Gerencie reviews e artigos relacionados aos periféricos." },
  "/admin/videos":      { title: "Vídeos", description: "Últimos vídeos e redes sociais do canal." },
  "/admin/ranking":     { title: "Ranking", description: "Pontuação (Performance e Estabilidade)." },
  "/admin/offers":      { title: "Ofertas", description: "Ofertas sincronizadas das mensagens do Telegram." },
  "/admin/users":       { title: "Usuários e permissões", description: "Controle quem pode ler ou editar cada seção." },
  "/admin/settings":    { title: "Configurações", description: "Gerencie seu perfil e preferências do sistema." },
  "/admin/store":       { title: "Loja", description: "Gerencie os produtos da loja." },
  "/admin/vips":        { title: "VIPs", description: "Assinaturas VIP: estado na Asaas, cobranças e concessão manual." },
  "/admin/forum":       { title: "Fórum (moderação)", description: "Modere posts, comentários e regras da comunidade." },
  "/admin/suporte":     { title: "Suporte", description: "Veja e responda aos chamados abertos pelos clientes." },
  "/admin/perifericos/pedidos": { title: "Pedidos de periférico", description: "Pedidos da comunidade para cadastrar periféricos que ainda não estão na wiki." },
  "/admin/forum/denuncias": { title: "Denúncias", description: "Posts e comentários denunciados pela comunidade." },
  "/admin/eventos":     { title: "Conquistas", description: "Gerencie as conquistas que concedem medalhas automaticamente." },
  "/admin/maintenance": { title: "Modo de manutenção", description: "Ative o modo de manutenção do site." },
  "/admin/notificacoes":{ title: "Avisos do sistema", description: "Envie um recado que aparece no sino de quem usa o site." },
  "/admin/login":       { title: "Login" },
}

type Dict = ReturnType<typeof useT>

/**
 * Rotas públicas: títulos e descrições vêm do dicionário para acompanharem o
 * idioma escolhido. Antes o mapa era uma constante de módulo em português, e
 * o cabeçalho continuava "Periférico" mesmo com o site em inglês.
 */
function publicPageDefaults(t: Dict): Record<string, PageDefaults> {
  const h = t.pageHeader
  return {
    "/":                      { title: h.home, description: h.homeDesc },
    "/noticias":              { title: h.news, description: h.newsDesc },
    "/perifericos":           { title: h.peripherals, description: h.peripheralsDesc },
    "/perifericos/pedidos":   { title: "Pedir cadastro", description: "Peça o cadastro de um periférico que ainda não está na wiki." },
    "/tierlist":              { title: h.tierlist, description: h.tierlistDesc },
    "/blog":                  { title: h.guides, description: h.guidesDesc },
    "/offers":                { title: h.offers, description: h.offersDesc },
    "/forum":                 { title: h.forum, description: h.forumDesc },
    "/pessoas":               { title: h.people, description: h.peopleDesc },
    "/conquistas":            { title: h.achievements, description: h.achievementsDesc },
    "/perfil":                { title: h.myProfile, description: h.myProfileDesc },
    "/conta":                 { title: h.account, description: h.accountDesc },
    "/videos":                { title: h.videos, description: h.videosDesc },
    "/changelog":             { title: h.changelog, description: h.changelogDesc },
  }
}

function getPageDefaults(pathname: string, t: Dict): PageDefaults {
  const publicDefaults = publicPageDefaults(t)
  if (publicDefaults[pathname]) return publicDefaults[pathname]
  if (ADMIN_PAGE_DEFAULTS[pathname]) return ADMIN_PAGE_DEFAULTS[pathname]
  if (pathname.startsWith("/admin/store/new"))   return { title: "Novo produto", description: "Adicione um item à loja." }
  if (pathname.startsWith("/admin/store/"))      return { title: "Editar produto", description: "Atualize as informações do produto." }
  if (pathname.startsWith("/admin/blog/new"))    return { title: "Novo artigo", description: "Crie um review ou artigo relacionado a um periférico." }
  if (pathname.startsWith("/admin/blog/"))       return { title: "Editar artigo", description: "Atualize o conteúdo do artigo." }
  if (pathname.startsWith("/admin/perifericos/pedidos/")) return { title: "Pedido de periférico", description: "Analise o pedido e responda a quem o abriu." }
  if (pathname.startsWith("/admin/perifericos/new")) return { title: "Novo periférico", description: "Adicione um novo periférico à wiki." }
  if (pathname.startsWith("/admin/perifericos/"))    return { title: "Editar periférico", description: "Atualize as informações do periférico." }
  if (pathname.startsWith("/admin/tierlist/new"))    return { title: "Novo periférico", description: "Adicione um novo periférico à tierlist." }
  if (pathname.startsWith("/admin/tierlist/"))       return { title: "Editar periférico", description: "Atualize as informações do periférico." }
  if (pathname.startsWith("/admin/forum/"))      return { title: "Moderar post", description: "Edite, oculte ou bloqueie um post do fórum." }
  if (pathname.startsWith("/admin/suporte/"))    return { title: "Suporte", description: "Veja e responda aos chamados abertos pelos clientes." }
  if (pathname.startsWith("/admin/eventos/new")) return { title: "Nova conquista", description: "Crie uma conquista e a medalha concedida por ela." }
  if (pathname.startsWith("/admin/eventos/"))    return { title: "Editar conquista", description: "Atualize os dados da conquista e da medalha." }
  if (pathname.startsWith("/admin/"))            return { title: "Admin" }
  if (pathname.startsWith("/blog/"))             return { title: t.pageHeader.review }
  if (pathname.startsWith("/forum/"))            return { title: t.pageHeader.forum }
  if (pathname.startsWith("/perifericos/pedidos/")) return { title: "Pedido de periférico" }
  if (pathname.startsWith("/perifericos/"))      return { title: t.pageHeader.peripheral }
  if (pathname.startsWith("/perfil/"))           return { title: t.pageHeader.profile, description: t.pageHeader.profileDesc }
  return { title: t.pageHeader.fallback }
}

export function TopBar() {
  const {
    publicCollapsed,
    adminCollapsed,
    togglePublic,
    toggleAdmin,
    isMobileOpen,
    isAdminMobileOpen,
    setMobileOpen,
    setAdminMobileOpen,
  } = useSidebar()
  const pathname = usePathname()

  const isAdmin = pathname?.startsWith("/admin")
  // No checkout o carrinho já está todo listado na própria página — mostrar o
  // botão/badge aqui só distrai (ou pior, deixa reabrir a gaveta por cima do QR code do PIX).
  const isCheckout = pathname?.startsWith("/checkout")
  const isCollapsed = isAdmin ? adminCollapsed : publicCollapsed
  const toggleCollapsed = isAdmin ? toggleAdmin : togglePublic

  // No desktop colapsa/expande a sidebar; no mobile abre/fecha o drawer.
  // As duas ações NÃO são intercambiáveis: `toggleCollapsed` também vale no
  // mobile, e disparar os dois juntos abria o drawer já colapsado (só ícones)
  // no primeiro toque. Por isso o breakpoint é checado de verdade aqui.
  const handleSidebarToggle = () => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches
    if (isDesktop) {
      toggleCollapsed()
      return
    }
    if (isAdmin) {
      setAdminMobileOpen(!isAdminMobileOpen)
    } else {
      setMobileOpen(!isMobileOpen)
    }
  }

  const t = useT()
  const defaults = getPageDefaults(pathname ?? "/", t)
  const override = usePageHeaderState()
  const pageTitle = override.title ?? defaults.title
  const pageDescription = override.description ?? defaults.description

  return (
    <div className="sticky top-0 z-20 min-h-16 border-b border-border bg-card">
      <div className="min-h-16 flex items-center justify-between gap-4 px-4 py-2">
        {/* Left — Toggle + Page Title + Description */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleSidebarToggle}
            className={cn(
              // 44px no mobile: é o único acesso à gaveta de navegação por lá.
              "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground md:size-8"
            )}
            aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
          >
            <PanelLeft className="size-[18px]" />
          </button>
          <div className="h-8 w-px shrink-0 bg-border" />
          <div className="min-w-0 flex flex-col justify-center leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">{pageTitle}</span>
            {pageDescription && (
              <span className="truncate text-xs text-muted-foreground">{pageDescription}</span>
            )}
          </div>
        </div>

        {/* Right — no mobile, prioriza notificação e missão diária: Aura
            sai da barra e vira item do menu do avatar. */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
          {/* Carrinho — só aparece se houver itens pendentes, pra não poluir
              o header. Some no checkout. */}
          {!isAdmin && !isCheckout && <CartButton />}

          {/* Notificações — vale também no admin, onde não há AuthUser aqui. */}
          <NotificationBell />

          {/* Conta — sempre visível no canto; no admin fica na própria sidebar. */}
          {!isAdmin && (
            <>
              <AuraMissionsBadge />
              <div className="hidden h-6 w-px shrink-0 bg-border sm:block" />
              <AuthUser
                layout="topbar"
                variant="public"
                loginHref="/login"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
