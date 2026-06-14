"use client"

import { useEffect, useState } from "react"
import type { UserIdentity } from "@supabase/supabase-js"
import { Link2, Unlink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DiscordIcon, GoogleIcon } from "@/components/auth/provider-icons"
import { supabaseAuth } from "@/lib/client/supabase-auth"

type ProviderKey = "google" | "discord"

const PROVIDERS: { key: ProviderKey; label: string; Icon: typeof GoogleIcon }[] = [
  { key: "google", label: "Google", Icon: GoogleIcon },
  { key: "discord", label: "Discord", Icon: DiscordIcon },
]

export function LinkedAccountsTab() {
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<ProviderKey | null>(null)

  useEffect(() => {
    loadIdentities()
  }, [])

  async function loadIdentities() {
    try {
      setLoading(true)
      const { data, error } = await supabaseAuth.auth.getUserIdentities()
      if (error) throw error
      setIdentities(data.identities ?? [])
    } catch {
      setIdentities([])
    } finally {
      setLoading(false)
    }
  }

  const totalIdentities = identities?.length ?? 0

  async function link(provider: ProviderKey) {
    try {
      setBusy(provider)
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/perfil")}`
      const { error } = await supabaseAuth.auth.linkIdentity({ provider, options: { redirectTo } })
      // Em caso de sucesso o navegador é redirecionado; o código abaixo só roda em falha.
      if (error) throw error
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Tente novamente."
      toast.error("Não foi possível vincular", { description: message })
      setBusy(null)
    }
  }

  async function unlink(provider: ProviderKey) {
    const identity = identities?.find((i) => i.provider === provider)
    if (!identity) return
    if (totalIdentities <= 1) {
      toast.error("Não é possível desvincular", {
        description: "Você precisa de pelo menos um método de login ativo.",
      })
      return
    }
    try {
      setBusy(provider)
      const { error } = await supabaseAuth.auth.unlinkIdentity(identity)
      if (error) throw error
      toast.success(`${provider === "google" ? "Google" : "Discord"} desvinculado`)
      await loadIdentities()
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Tente novamente."
      toast.error("Não foi possível desvincular", { description: message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-border bg-card/90">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-primary" />
          Contas vinculadas
        </CardTitle>
        <CardDescription>Conecte suas contas sociais para entrar com um clique.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          PROVIDERS.map(({ key, label, Icon }) => {
            const linked = identities?.some((i) => i.provider === key)
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-background">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {linked ? "Conectado" : "Não conectado"}
                    </p>
                  </div>
                </div>
                {linked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unlink(key)}
                    disabled={busy === key}
                    className="gap-2 text-red-400 hover:text-red-300"
                  >
                    <Unlink className="size-4" />
                    Desvincular
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => link(key)} disabled={busy === key} className="gap-2">
                    <Link2 className="size-4" />
                    {busy === key ? "Conectando..." : "Vincular"}
                  </Button>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
