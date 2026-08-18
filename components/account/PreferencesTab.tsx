"use client"

import { useState } from "react"
import { LogOut, Palette } from "lucide-react"
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
import { supabaseAuth } from "@/lib/client/supabase-auth"
import { LANGUAGE_OPTIONS, type LocaleCode } from "@/lib/i18n"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

export function PreferencesTab() {
  const { locale, setLocale } = useLocale()
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function persist(changes: { locale?: string }) {
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
    <div className="space-y-8">
      {/* ── Idioma ── */}
      <Card className={cn(CARD_SURFACE_INTERACTIVE, "shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-black/10")}>
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-primary" />
            Idioma
          </CardTitle>
          <CardDescription>
            Preferências sincronizadas com sua conta{savingPrefs ? " — salvando…" : "."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
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
      <Card className={cn(CARD_SURFACE_INTERACTIVE, "shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-black/10")}>
        <CardHeader className="border-b border-border/60">
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
