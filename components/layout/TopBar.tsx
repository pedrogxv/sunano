"use client"

import { Check, ChevronDown, Globe, Moon, PanelLeft, Send, Sun, Youtube } from "lucide-react"
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
import { useLocale } from "@/lib/locale-context"
import { useTheme } from "@/lib/theme-context"
import { useSidebar } from "@/lib/sidebar-context"
import { cn } from "@/lib/utils"

const SOCIAL_LINKS = [
  {
    label: "YouTube",
    icon: Youtube,
    href: "https://youtube.com/@sunano",
    color: "bg-red-600 text-white hover:bg-red-500",
  },
  {
    label: "Telegram",
    icon: Send,
    href: "https://t.me/sumano",
    color: "bg-[#0088cc] text-white hover:bg-[#0088cc]/90",
  },
]

const PAGE_TITLES: Record<string, string> = {
  "/": "Tier List",
  "/noticias": "Noticias",
  "/perifericos": "Perifericos",
  "/blog": "Reviews",
  "/offers": "Ofertas",
  "/forum": "Forum",
  "/videos": "Videos",
  "/changelog": "Changelog",
  "/admin": "Dashboard",
  "/admin/tierlist": "Tierlist",
  "/admin/perifericos": "Perifericos",
  "/admin/blog": "Blog & Reviews",
  "/admin/offers": "Ofertas",
  "/admin/users": "Usuários",
  "/admin/settings": "Configurações",
  "/admin/login": "Login",
}

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith("/blog/")) return "Review"
  if (pathname.startsWith("/forum/")) return "Forum"
  if (pathname.startsWith("/perifericos/")) return "Periférico"
  if (pathname.startsWith("/admin/")) return "Admin"
  return "Sunano"
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
  const pageTitle = getPageTitle(pathname ?? "/")

  return (
    <div
      className={cn(
        " h-16 z-20 border-b border-border transition-[left] duration-300",
        "left-16",
        isCollapsed ? "md:left-16" : isAdmin ? "md:left-64" : "md:left-64"
      )}
    >
      <div className="h-full flex items-center justify-between px-4">
        {/* Left — Toggle + Page Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
            aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
          >
            <PanelLeft className="size-[18px]" />
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-semibold tracking-tight text-foreground">{pageTitle}</span>
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
                    "flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all",
                    link.color
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
