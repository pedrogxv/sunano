"use client"

import { useState } from "react"
import { LogOut, Moon, Palette, Sun } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLocale } from "@/components/providers/locale-context"
import { useTheme } from "@/components/providers/theme-context"
import { supabaseAuth } from "@/lib/client/supabase-auth"
import { LANGUAGE_OPTIONS, type LocaleCode } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const THEME_ICONS = { dark: Moon, light: Sun } as const

export function PreferencesTab() {
  const { theme, setTheme, themes } = useTheme()
  const { locale, setLocale } = useLocale()
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function persist(changes: { theme?: string; locale?: string }) {
    try {
      setSavingPrefs(true)
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      })
    } catch {
      /* a preferência local já foi aplicada; persistência é best-effort */
    } finally {
      setSavingPrefs(false)
    }
  }

  function onThemeChange(value: typeof theme) {
    if (value === theme) return
    setTheme(value)
    void persist({ theme: value })
  }

  function onLocaleChange(value: string) {
    setLocale(value as LocaleCode)
    void persist({ locale: value })
  }

  async function signOutEverywhere() {
    try {
      setSigningOut(true)
      await supabaseAuth.auth.signOut({ scope: "global" })
      toast.success("Sessões encerradas")
      window.location.href = "/login"
    } catch {
      toast.error("Não foi possível encerrar as sessões.")
      setSigningOut(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Aparência ── */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-primary" />
            Aparência e idioma
          </CardTitle>
          <CardDescription>
            Preferências sincronizadas com sua conta{savingPrefs ? " — salvando…" : "."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tema</span>
            {/* Segmentado em vez de um botão isolado: ocupa a mesma largura do
                select ao lado, então a linha não fica com um vão vazio. */}
            <div
              role="radiogroup"
              aria-label="Tema"
              className="grid h-8 w-full grid-cols-2 gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5"
            >
              {themes.map((option) => {
                const Icon = THEME_ICONS[option.key]
                const active = theme === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onThemeChange(option.key)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                      active
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-[15px]", active && "text-primary")} />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Idioma</label>
            <Select value={locale} onValueChange={onLocaleChange}>
              <SelectTrigger className="w-full border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.nativeLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Sessões ── */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <LogOut className="size-4 text-primary" />
            Sessões
          </CardTitle>
          <CardDescription>Encerre o acesso em todos os dispositivos onde você está logado.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 pt-5">
          <p className="text-sm text-muted-foreground">
            Útil se você perdeu um dispositivo ou suspeita de acesso indevido.
          </p>
          <Button variant="outline" onClick={signOutEverywhere} disabled={signingOut} className="gap-2 shrink-0" size="sm">
            <LogOut className="size-4" />
            {signingOut ? "Saindo..." : "Sair de tudo"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
