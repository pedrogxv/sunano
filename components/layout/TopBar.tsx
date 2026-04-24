"use client"

import { Check, ChevronDown, Globe, MessageCircle, Send, Youtube } from "lucide-react"
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

  const selectedLanguage = getLanguageEntry(locale)

  const updateLocale = (nextLocale: LocaleCode) => {
    setLocale(nextLocale)
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/[0.08] bg-[#0d1117] backdrop-blur-md">
      <div className="h-full max-w-full flex items-center justify-between px-5">
        {/* Left Section - Logo/Brand */}
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 font-bold text-white shadow-lg shadow-cyan-500/20">
            S
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-slate-50">Sunano</span>
            <span className="text-[9px] font-medium uppercase tracking-widest text-slate-500">Tierlist</span>
          </div>
        </div>

        {/* Right Section - Language + Social Links */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-sm font-medium text-slate-200 transition-all hover:bg-white/[0.1]"
                type="button"
              >
                <Globe className="size-4 text-cyan-300" />
                <span className="hidden sm:inline">{selectedLanguage.nativeLabel}</span>
                <span className="sm:hidden">{selectedLanguage.shortLabel}</span>
                <ChevronDown className="size-3.5 text-slate-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-white/10 bg-[#131a28]">
              <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
                <div className="text-sm font-semibold text-slate-100">{I18N[locale].topbar.languageLabel}</div>
                <div className="text-xs font-normal text-slate-500">
                  {I18N[locale].topbar.languageHelper}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/[0.08]" />
              {LANGUAGE_OPTIONS.map((language) => {
                const isActive = language.code === locale

                return (
                  <DropdownMenuItem
                    key={language.code}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-2 text-sm text-slate-200 focus:bg-white/[0.06] focus:text-slate-50",
                      isActive && "bg-cyan-500/10 text-cyan-200"
                    )}
                    onSelect={() => updateLocale(language.code)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{language.nativeLabel}</span>
                      <span className="text-xs text-slate-500">{language.label}</span>
                    </div>
                    {isActive && <Check className="size-4 text-cyan-300" />}
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
