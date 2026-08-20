"use client"

import { PanelLeft } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
import { cn } from "@/lib/utils"

type PageDefaults = { title: string; description?: string }

const PAGE_DEFAULTS: Record<string, PageDefaults> = {
  "/":                  { title: "Home", description: "Tudo que você precisa saber." },
  "/noticias":          { title: "Notícias", description: "Últimas novidades do mundo dos periféricos." },
  "/perifericos":       { title: "Periféricos", description: "Wiki pesquisável com filtros por categoria, marca e preço." },
  "/tierlist":          { title: "Tierlist", description: "Ranking dos melhores periféricos por categoria." },
  "/blog":              { title: "Guias", description: "Guias completos para diversos assuntos, redigidos por especialistas do Sunano." },
  "/offers":            { title: "Promoções", description: "Promoções e descontos selecionados do Telegram." },
  "/mercado":           { title: "Mercado", description: "Anúncios de produtos novos e usados publicados pela comunidade." },
  "/mercado/novo":      { title: "Anunciar", description: "Publique um anúncio no Mercado." },
  "/mercado/meus-anuncios": { title: "Meus anúncios", description: "Gerencie os anúncios que você publicou no Mercado." },
  "/forum":             { title: "Fórum", description: "Discussões e perguntas da comunidade." },
  "/pessoas":           { title: "Pessoas", description: "Encontre outros membros, veja os destaques e siga quem você curte." },
  "/conquistas":        { title: "Conquistas", description: "Medalhas e conquistas por tempo limitado." },
  "/perfil":            { title: "Meu Perfil", description: "Identidade e vitrine pública." },
  "/conta":             { title: "Conta e segurança", description: "Acesso, preferências e privacidade." },
  "/videos":            { title: "Vídeos e redes sociais", description: "Conteúdo em vídeo do canal e todos os canais oficiais do Sunano." },
  "/changelog":         { title: "Changelog", description: "Histórico de mudanças no site." },
  "/admin":             { title: "Dashboard", description: "Visão geral do painel administrativo." },
  "/admin/tierlist":    { title: "Admin Tierlist", description: "Arraste e solte para reorganizar. Clique para editar." },
  "/admin/perifericos": { title: "Periféricos", description: "Gerencie a wiki de periféricos." },
  "/admin/blog":        { title: "Blog & Reviews", description: "Gerencie reviews e artigos relacionados aos periféricos." },
  "/admin/videos":      { title: "Vídeos", description: "Últimos vídeos e redes sociais do canal." },
  "/admin/ranking":     { title: "Ranking", description: "Pontuação (Performance e Estabilidade)." },
  "/admin/offers":      { title: "Ofertas", description: "Ofertas sincronizadas das mensagens do Telegram." },
  "/admin/users":       { title: "Usuários e permissões", description: "Controle quem pode ler ou editar cada seção." },
  "/admin/settings":    { title: "Configurações", description: "Gerencie seu perfil e preferências do sistema." },
  "/admin/store":       { title: "Loja & Bazar", description: "Gerencie os produtos da loja e os itens do bazar." },
  "/admin/market":      { title: "Mercado", description: "Modere os anúncios publicados pela comunidade e gerencie banimentos." },
  "/admin/forum":       { title: "Fórum (moderação)", description: "Modere posts, comentários e regras da comunidade." },
  "/admin/suporte":     { title: "Suporte", description: "Veja e responda aos chamados abertos pelos clientes." },
  "/admin/forum/denuncias": { title: "Denúncias", description: "Posts e comentários denunciados pela comunidade." },
  "/admin/eventos":     { title: "Conquistas", description: "Gerencie as conquistas que concedem medalhas automaticamente." },
  "/admin/maintenance": { title: "Modo de manutenção", description: "Ative o modo de manutenção do site." },
  "/admin/notificacoes":{ title: "Avisos do sistema", description: "Envie um recado que aparece no sino de quem usa o site." },
  "/admin/login":       { title: "Login" },
}

/**
 * Selo permanente de fase Beta — visível em toda página (via `TopBar`,
 * renderizado globalmente pelo `LayoutShell`), independente do título da
 * rota. Leva pro changelog: é o lugar que explica o que "beta" significa
 * e o que já mudou.
 */
function AlphaBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/changelog"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-violet-400/40 bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-300 transition-colors hover:from-violet-500/25 hover:to-fuchsia-500/25"
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-violet-400" />
          </span>
          Beta
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-[220px] text-xs">
          O Sunano está em fase Beta: em construção ativa. Clique pra ver o changelog.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

function getPageDefaults(pathname: string): PageDefaults {
  if (PAGE_DEFAULTS[pathname]) return PAGE_DEFAULTS[pathname]
  if (pathname.startsWith("/admin/store/new"))   return { title: "Novo produto", description: "Adicione um item à loja ou ao bazar." }
  if (pathname.startsWith("/admin/store/"))      return { title: "Editar produto", description: "Atualize as informações do produto." }
  if (pathname.startsWith("/admin/blog/new"))    return { title: "Novo artigo", description: "Crie um review ou artigo relacionado a um periférico." }
  if (pathname.startsWith("/admin/blog/"))       return { title: "Editar artigo", description: "Atualize o conteúdo do artigo." }
  if (pathname.startsWith("/admin/perifericos/new")) return { title: "Novo periférico", description: "Adicione um novo periférico à wiki." }
  if (pathname.startsWith("/admin/perifericos/"))    return { title: "Editar periférico", description: "Atualize as informações do periférico." }
  if (pathname.startsWith("/admin/tierlist/new"))    return { title: "Novo periférico", description: "Adicione um novo periférico à tierlist." }
  if (pathname.startsWith("/admin/tierlist/"))       return { title: "Editar periférico", description: "Atualize as informações do periférico." }
  if (pathname.startsWith("/admin/forum/"))      return { title: "Moderar post", description: "Edite, oculte ou bloqueie um post do fórum." }
  if (pathname.startsWith("/admin/suporte/"))    return { title: "Suporte", description: "Veja e responda aos chamados abertos pelos clientes." }
  if (pathname.startsWith("/admin/eventos/new")) return { title: "Nova conquista", description: "Crie uma conquista e a medalha concedida por ela." }
  if (pathname.startsWith("/admin/eventos/"))    return { title: "Editar conquista", description: "Atualize os dados da conquista e da medalha." }
  if (pathname.startsWith("/admin/"))            return { title: "Admin" }
  if (pathname.startsWith("/blog/"))             return { title: "Review" }
  if (pathname.startsWith("/forum/"))            return { title: "Fórum" }
  if (pathname.startsWith("/perifericos/"))      return { title: "Periférico" }
  if (pathname.startsWith("/perfil/"))           return { title: "Perfil", description: "Vitrine pública do membro." }
  if (pathname.startsWith("/mercado/"))          return { title: "Anúncio" }
  return { title: "Sunano" }
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

  // On desktop this collapses/expands the sidebar; on mobile it opens/closes the
  // drawer. Each action is inert at the other breakpoint, so we fire both.
  const handleSidebarToggle = () => {
    if (isAdmin) {
      toggleCollapsed()
      setAdminMobileOpen(!isAdminMobileOpen)
    } else {
      // Na área pública não há recolhimento no desktop; o botão só abre a gaveta no mobile.
      setMobileOpen(!isMobileOpen)
    }
  }

  const defaults = getPageDefaults(pathname ?? "/")
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
              "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground md:size-8",
              !isAdmin && "md:hidden"
            )}
            aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
          >
            <PanelLeft className="size-[18px]" />
          </button>
          <div className={cn("h-8 w-px shrink-0 bg-border", !isAdmin && "md:hidden")} />
          <div className="min-w-0 flex flex-col justify-center leading-tight">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight text-foreground">{pageTitle}</span>
              <AlphaBadge />
            </div>
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
