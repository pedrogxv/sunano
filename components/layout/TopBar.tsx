"use client"

import { Check, ChevronDown, Globe, Moon, PanelLeft, Settings2, Sun } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Code-split: o AuthUser puxa o cliente Supabase (@supabase/ssr), pesado e
// desnecessário para a primeira pintura. Carregá-lo sob demanda tira esse
// peso do bundle crítico de TODAS as páginas públicas. O placeholder abaixo
// é idêntico ao esqueleto que o próprio AuthUser exibe enquanto checa a sessão,
// então não há mudança visual nem layout shift.
const AuthUser = dynamic(
  () => import("@/components/auth/auth-user").then((m) => m.AuthUser),
  {
    ssr: false,
    loading: () => <div className="size-8 shrink-0 rounded-lg bg-muted/40 animate-pulse md:size-8" />,
  }
)
// Mesmo motivo do AuthUser: o sino só interessa a quem está logado e puxa
// date-fns + popover. Fora do bundle crítico das páginas públicas. Ele já
// se esconde sozinho quando não há sessão, então o placeholder é vazio.
const NotificationBell = dynamic(
  () => import("@/components/notifications/notification-bell").then((m) => m.NotificationBell),
  { ssr: false }
)
// Idem: o saldo de Aura só existe pra quem tem conta e busca seu próprio
// endpoint — sem sentido no bundle público. Também se esconde sozinho.
const AuraBalanceBadge = dynamic(
  () => import("@/components/layout/AuraBalanceBadge").then((m) => m.AuraBalanceBadge),
  { ssr: false }
)
import { getLanguageEntry, I18N, LANGUAGE_OPTIONS, type LocaleCode } from "@/lib/i18n"
import { useLocale } from "@/components/providers/locale-context"
import { useTheme } from "@/components/providers/theme-context"
import { useSidebar } from "@/components/providers/sidebar-context"
import { usePageHeaderState } from "@/components/providers/page-header-context"
import { cn } from "@/lib/utils"

type PageDefaults = { title: string; description?: string }

const PAGE_DEFAULTS: Record<string, PageDefaults> = {
  "/":                  { title: "Home", description: "Tudo que você precisa saber." },
  "/noticias":          { title: "Notícias", description: "Últimas novidades do mundo dos periféricos." },
  "/perifericos":       { title: "Periféricos", description: "Wiki pesquisável com filtros por categoria, marca e preço." },
  "/tierlist":          { title: "Tierlist", description: "Ranking dos melhores periféricos por categoria." },
  "/blog":              { title: "Guias", description: "Guias completos para diversos assuntos, redigidos por especialistas do Sunano." },
  "/offers":            { title: "Promoções", description: "Promoções e descontos selecionados do Telegram." },
  "/forum":             { title: "Fórum", description: "Discussões e perguntas da comunidade." },
  "/pessoas":           { title: "Pessoas", description: "Encontre outros membros, veja os destaques e siga quem você curte." },
  "/eventos":           { title: "Eventos", description: "Medalhas e conquistas por tempo limitado." },
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
  "/admin/forum":       { title: "Fórum (moderação)", description: "Modere posts, comentários e regras da comunidade." },
  "/admin/forum/denuncias": { title: "Denúncias", description: "Posts e comentários denunciados pela comunidade." },
  "/admin/eventos":     { title: "Eventos", description: "Gerencie os eventos que concedem medalhas automaticamente." },
  "/admin/maintenance": { title: "Modo de manutenção", description: "Ative o modo de manutenção do site." },
  "/admin/notificacoes":{ title: "Avisos do sistema", description: "Envie um recado que aparece no sino de quem usa o site." },
  "/admin/login":       { title: "Login" },
}

/**
 * Selo permanente de fase Alpha — visível em toda página (via `TopBar`,
 * renderizado globalmente pelo `LayoutShell`), independente do título da
 * rota. Leva pro changelog: é o lugar que explica o que "alpha" significa
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
          Alpha
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-[220px] text-xs">
          O Sunano está em fase Alpha: em construção ativa. Clique pra ver o changelog.
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
  if (pathname.startsWith("/admin/eventos/new")) return { title: "Novo evento", description: "Crie um evento e a medalha concedida por ele." }
  if (pathname.startsWith("/admin/eventos/"))    return { title: "Editar evento", description: "Atualize os dados do evento e da medalha." }
  if (pathname.startsWith("/admin/"))            return { title: "Admin" }
  if (pathname.startsWith("/blog/"))             return { title: "Review" }
  if (pathname.startsWith("/forum/"))            return { title: "Fórum" }
  if (pathname.startsWith("/perifericos/"))      return { title: "Periférico" }
  if (pathname.startsWith("/perfil/"))           return { title: "Perfil", description: "Vitrine pública do membro." }
  return { title: "Sunano" }
}

export function TopBar() {
  const { locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
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

  const isLight = theme === "light"
  const selectedLanguage = getLanguageEntry(locale)
  const isAdmin = pathname?.startsWith("/admin")
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
    <div className="min-h-16 border-b border-border">
      <div className="min-h-16 flex items-center justify-between gap-4 px-4 py-2">
        {/* Left — Toggle + Page Title + Description */}
        <div className="flex items-center gap-3 min-w-0">
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

        {/* Right — Language + Theme */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Mobile (<sm): idioma e tema colapsam num único menu pra não estourar a largura. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70 text-foreground transition-all hover:bg-muted/40 sm:hidden"
                type="button"
                aria-label="Idioma e tema"
              >
                <Settings2 className="size-[16px] text-primary" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-border bg-popover text-foreground shadow-xl">
              <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
                <div className="text-sm font-semibold text-foreground">{I18N[locale].topbar.languageLabel}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {I18N[locale].topbar.languageHelper}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              {LANGUAGE_OPTIONS.map((language) => {
                const isActive = language.code === locale
                return (
                  <DropdownMenuItem
                    key={language.code}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-2 text-sm text-foreground focus:bg-muted/40 focus:text-foreground",
                      isActive && "bg-primary/15 text-primary"
                    )}
                    onSelect={() => setLocale(language.code as LocaleCode)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{language.nativeLabel}</span>
                      <span className="text-xs text-muted-foreground">{language.label}</span>
                    </div>
                    {isActive && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-foreground focus:bg-muted/40 focus:text-foreground"
                onSelect={(e) => {
                  e.preventDefault()
                  setTheme(isLight ? "dark" : "light")
                }}
              >
                <span className="font-medium">{isLight ? "Modo escuro" : "Modo claro"}</span>
                {isLight ? (
                  <Moon className="size-4 text-primary" />
                ) : (
                  <Sun className="size-4 text-primary" />
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* sm+: idioma e tema voltam a ser controles próprios, lado a lado. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hidden h-8 items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40 sm:flex"
                type="button"
              >
                <Globe className="size-[15px] text-primary" />
                <span className="hidden lg:inline">{selectedLanguage.nativeLabel}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-border bg-popover text-foreground shadow-xl">
              <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
                <div className="text-sm font-semibold text-foreground">{I18N[locale].topbar.languageLabel}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {I18N[locale].topbar.languageHelper}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              {LANGUAGE_OPTIONS.map((language) => {
                const isActive = language.code === locale
                return (
                  <DropdownMenuItem
                    key={language.code}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-2 text-sm text-foreground focus:bg-muted/40 focus:text-foreground",
                      isActive && "bg-primary/15 text-primary"
                    )}
                    onSelect={() => setLocale(language.code as LocaleCode)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{language.nativeLabel}</span>
                      <span className="text-xs text-muted-foreground">{language.label}</span>
                    </div>
                    {isActive && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            className="hidden h-8 items-center gap-2 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40 sm:flex"
            type="button"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            aria-label={isLight ? "Ativar modo escuro" : "Ativar modo claro"}
          >
            {isLight ? (
              <Moon className="size-[15px] text-primary" />
            ) : (
              <Sun className="size-[15px] text-primary" />
            )}
          </button>

          {/* Notificações — vale também no admin, onde não há AuthUser aqui. */}
          <NotificationBell />

          {/* Conta — sempre visível no canto; no admin fica na própria sidebar. */}
          {!isAdmin && (
            <>
              <AuraBalanceBadge />
              <div className="hidden h-6 w-px shrink-0 bg-border sm:block" />
              <AuthUser layout="topbar" variant="public" loginHref="/login" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
