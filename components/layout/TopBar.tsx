"use client"

import type { SVGProps } from "react"
import { Check, ChevronDown, Globe, MessageCircleMore, Moon, PanelLeft, Send, Sun, Youtube } from "lucide-react"
import { usePathname } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getLanguageEntry, I18N, LANGUAGE_OPTIONS, type LocaleCode } from "@/lib/i18n"
import { useLocale } from "@/components/providers/locale-context"
import { useTheme } from "@/components/providers/theme-context"
import { useSidebar } from "@/components/providers/sidebar-context"
import { usePageHeaderState } from "@/components/providers/page-header-context"
import { cn } from "@/lib/utils"

const SOCIAL_LINKS = [
  {
    label: "YouTube",
    icon: Youtube,
    href: "https://youtube.com/@sunano",
  },
  {
    label: "Discord",
    icon: MessageCircleMore,
    href: "https://discord.gg/kAHbEe5w3D",
  },
  {
    label: "Telegram",
    icon: Send,
    href: "https://t.me/sumano",
  },
]

type PageDefaults = { title: string; description?: string }

const PAGE_DEFAULTS: Record<string, PageDefaults> = {
  "/":                  { title: "Home", description: "Tudo que você precisa saber." },
  "/noticias":          { title: "Notícias", description: "Últimas novidades do mundo dos periféricos." },
  "/perifericos":       { title: "Periféricos", description: "Wiki pesquisável com filtros por categoria, marca e preço." },
  "/blog":              { title: "Reviews", description: "Reviews completos e análises detalhadas." },
  "/offers":            { title: "Ofertas", description: "Promoções e descontos selecionados do Telegram." },
  "/forum":             { title: "Fórum", description: "Discussões e perguntas da comunidade." },
  "/videos":            { title: "Vídeos", description: "Conteúdo em vídeo do canal." },
  "/changelog":         { title: "Changelog", description: "Histórico de mudanças no site." },
  "/admin":             { title: "Dashboard", description: "Visão geral do painel administrativo." },
  "/admin/tierlist":    { title: "Admin Tierlist", description: "Arraste e solte para reorganizar. Clique para editar." },
  "/admin/perifericos": { title: "Periféricos", description: "Gerencie a wiki de periféricos." },
  "/admin/blog":        { title: "Blog & Reviews", description: "Gerencie reviews e artigos relacionados aos periféricos." },
  "/admin/offers":      { title: "Ofertas", description: "Ofertas sincronizadas das mensagens do Telegram." },
  "/admin/users":       { title: "Usuários e permissões", description: "Controle quem pode ler ou editar cada seção." },
  "/admin/settings":    { title: "Configurações", description: "Gerencie seu perfil e preferências do sistema." },
  "/admin/store":       { title: "Loja & Bazar", description: "Gerencie os produtos da loja e os itens do bazar." },
  "/admin/forum":       { title: "Fórum (moderação)", description: "Modere posts, comentários e regras da comunidade." },
  "/admin/maintenance": { title: "Modo de manutenção", description: "Ative o modo de manutenção do site." },
  "/admin/login":       { title: "Login" },
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
  if (pathname.startsWith("/admin/"))            return { title: "Admin" }
  if (pathname.startsWith("/blog/"))             return { title: "Review" }
  if (pathname.startsWith("/forum/"))            return { title: "Fórum" }
  if (pathname.startsWith("/perifericos/"))      return { title: "Periférico" }
  return { title: "Sunano" }
}

export function TopBar() {
  const { locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const { publicCollapsed, adminCollapsed, togglePublic, toggleAdmin } = useSidebar()
  const pathname = usePathname()

  const isLight = theme === "light"
  const selectedLanguage = getLanguageEntry(locale)
  const isAdmin = pathname?.startsWith("/admin")
  const isCollapsed = isAdmin ? adminCollapsed : publicCollapsed
  const toggleCollapsed = isAdmin ? toggleAdmin : togglePublic

  const defaults = getPageDefaults(pathname ?? "/")
  const override = usePageHeaderState()
  const pageTitle = override.title ?? defaults.title
  const pageDescription = override.description ?? defaults.description

  return (
    <div
      className={cn(
        "min-h-16 z-20 border-b border-border transition-[left] duration-300",
        "left-16",
        isCollapsed ? "md:left-16" : isAdmin ? "md:left-64" : "md:left-64"
      )}
    >
      <div className="min-h-16 flex items-center justify-between gap-4 px-4 py-2">
        {/* Left — Toggle + Page Title + Description */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
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

        {/* Right — Theme + Language + Social */}
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 items-center gap-2 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40"
            type="button"
            onClick={() => setTheme(isLight ? "midnight" : "light")}
            aria-label={isLight ? "Ativar modo night" : "Ativar modo dia"}
          >
            {isLight ? (
              <Moon className="size-[15px] text-primary" />
            ) : (
              <Sun className="size-[15px] text-primary" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40"
                type="button"
              >
                <Globe className="size-[15px] text-primary" />
                <span className="hidden sm:inline">{selectedLanguage.nativeLabel}</span>
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

          <div className="hidden sm:flex items-center gap-1.5">
            {SOCIAL_LINKS.map((link) => {
              const Icon = link.icon
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={link.label}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-foreground shadow-sm transition-all hover:bg-foreground hover:text-background"
                  )}
                >
                  <Icon className="size-[15px]" />
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
