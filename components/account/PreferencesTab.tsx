"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Palette, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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

export function PreferencesTab() {
  const router = useRouter()
  const { theme, setTheme, themes } = useTheme()
  const { locale, setLocale } = useLocale()
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  function onThemeChange(value: string) {
    setTheme(value as typeof theme)
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

  async function deleteAccount() {
    try {
      setDeleting(true)
      const res = await fetch("/api/profile/delete", { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "")
      await supabaseAuth.auth.signOut().catch(() => {})
      toast.success("Conta excluída")
      router.replace("/")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Tente novamente."
      toast.error("Erro ao excluir a conta", { description: message })
      setDeleting(false)
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
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tema</label>
            <Select value={theme} onValueChange={onThemeChange}>
              <SelectTrigger className="w-full border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* ── Zona de perigo ── */}
      <Card className="border-red-500/30 bg-red-500/5">
        <CardHeader className="border-b border-red-500/20">
          <CardTitle className="flex items-center gap-2 text-base text-red-300">
            <Trash2 className="size-4" />
            Excluir conta
          </CardTitle>
          <CardDescription className="text-red-300/60">
            Esta ação é permanente e remove seus dados de perfil. Não pode ser desfeita.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 pt-5">
          <p className="text-sm text-muted-foreground">Você sairá imediatamente após a exclusão.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={deleting} className="gap-2 shrink-0 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300" size="sm">
                <Trash2 className="size-4" />
                Excluir minha conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os seus dados de perfil serão removidos e você perderá o acesso. Esta ação é permanente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount} className="bg-red-500 text-white hover:bg-red-600">
                  Sim, excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
