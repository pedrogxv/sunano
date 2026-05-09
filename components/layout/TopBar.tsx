"use client"

import type { SVGProps } from "react"
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
    label: "Discord",
    icon: DiscordIcon,
    href: "https://discord.gg/kAHbEe5w3D",
    color: "bg-[#5865F2] text-white hover:bg-[#5865F2]/90",
  },
  {
    label: "Telegram",
    icon: Send,
    href: "https://t.me/sumano",
    color: "bg-[#0088cc] text-white hover:bg-[#0088cc]/90",
  },
]

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0c-.164-.385-.4-.874-.61-1.249a.077.077 0 0 0-.079-.037c-1.69.288-3.32.79-4.885 1.515a.07.07 0 0 0-.032.027C1.309 8.207.219 12.047.77 15.816a.08.08 0 0 0 .031.053 19.9 19.9 0 0 0 5.993 3.031.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.993a.076.076 0 0 0-.041-.106 13.07 13.07 0 0 1-1.872-.897.077.077 0 0 1-.008-.127c.125-.094.25-.192.369-.291a.074.074 0 0 1 .077-.01c3.927 1.792 8.18 1.792 12.061 0a.074.074 0 0 1 .078.01c.12.099.244.197.37.291a.077.077 0 0 1-.007.127c-.59.344-1.214.643-1.873.897a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.077.077 0 0 0 .084.028 19.876 19.876 0 0 0 6-3.032.077.077 0 0 0 .031-.052c.654-3.487-.55-7.294-3.178-11.42a.062.062 0 0 0-.031-.028ZM8.02 13.37c-1.18 0-2.148-1.085-2.148-2.419 0-1.334.94-2.418 2.148-2.418 1.218 0 2.196 1.094 2.177 2.418 0 1.334-.958 2.419-2.177 2.419Zm7.96 0c-1.18 0-2.148-1.085-2.148-2.419 0-1.334.94-2.418 2.148-2.418 1.219 0 2.197 1.094 2.177 2.418 0 1.334-.958 2.419-2.177 2.419Z" />
    </svg>
  )
}

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
