"use client"

import { Check, ChevronDown, Globe, MessageCircle, Moon, Palette, Send, Sun, Youtube } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getLanguageEntry,
  I18N,
  LANGUAGE_OPTIONS,
  type LocaleCode,
} from "@/lib/i18n"
import { useLocale } from "@/lib/locale-context"
import { useTheme } from "@/lib/theme-context"
import { cn } from "@/lib/utils"

const SOCIAL_LINKS = [
  {
    label: "YouTube",
    icon: Youtube,
    href: "https://youtube.com/@sunano",
    color: "bg-red-600 text-white hover:bg-red-500",
    text: "YouTube",
  },
  {
    label: "Telegram",
    icon: Send,
    href: "https://t.me/sumano",
    color: "bg-[#0088cc] text-white hover:bg-[#0088cc]/90",
    text: "Acesse o Grupo do Telegram",
  },
]

export function TopBar() {
  const { locale, setLocale } = useLocale()
  const { theme, setTheme, themes } = useTheme()

  const isLight = theme === "light"

  const selectedLanguage = getLanguageEntry(locale)

  const updateLocale = (nextLocale: LocaleCode) => {
    setLocale(nextLocale)
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background backdrop-blur-md">
      <div className="h-full max-w-full flex items-center justify-between px-5">
        {/* Left Section - Logo/Brand */}
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 font-bold text-primary-foreground shadow-lg shadow-black/20">
            S
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-foreground">Sunano</span>
            <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Tierlist</span>
          </div>
        </div>

        {/* Right Section - Language + Social Links */}
        <div className="flex items-center gap-3">
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40"
            type="button"
            onClick={() => setTheme(isLight ? "midnight" : "light")}
            aria-label={isLight ? "Ativar modo night" : "Ativar modo dia"}
          >
            {isLight ? <Moon className="size-4 text-primary" /> : <Sun className="size-4 text-primary" />}
            <span className="hidden sm:inline">{isLight ? "Night" : "Day"}</span>
            <span className="sm:hidden">{isLight ? "Ngt" : "Day"}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40"
                type="button"
              >
                <Palette className="size-4 text-primary" />
                <span className="hidden sm:inline">
                  {themes.find((option) => option.key === theme)?.label ?? "Theme"}
                </span>
                <span className="sm:hidden">{themes.find((option) => option.key === theme)?.label.slice(0, 3) ?? "Thm"}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-border bg-popover text-foreground shadow-xl">
              <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
                <div className="text-sm font-semibold text-foreground">{I18N[locale].topbar.themeLabel ?? (locale === "en-US" ? "Theme" : "Tema")}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {I18N[locale].topbar.themeHelper ?? (locale === "en-US" ? "Pick a color mood" : "Escolha um clima de cor")}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              {themes.map((option) => {
                const isActive = option.key === theme

                return (
                  <DropdownMenuItem
                    key={option.key}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-2 text-sm text-foreground focus:bg-muted/40 focus:text-foreground",
                      isActive && "bg-primary/15 text-primary"
                    )}
                    onSelect={() => setTheme(option.key)}
                  >
                    <span className="font-medium">{option.label}</span>
                    {isActive && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40"
                type="button"
              >
                <Globe className="size-4 text-primary" />
                <span className="hidden sm:inline">{selectedLanguage.nativeLabel}</span>
                <span className="sm:hidden">{selectedLanguage.shortLabel}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
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
                    onSelect={() => updateLocale(language.code)}
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

          <div className="flex items-center gap-3">
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
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    link.color
                  )}
                  title={link.label}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{link.text}</span>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
