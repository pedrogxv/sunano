"use client"

import { useState } from "react"
import type { ReactNode } from "react"

import { supabaseAuth } from "@/lib/client/supabase-auth"

type OAuthProvider = "google" | "discord"

interface OAuthButtonProps {
  /** Provedor OAuth habilitado no Supabase. */
  provider: OAuthProvider
  /** Texto do botão. Ex.: "Continuar com Google" ou "Cadastrar com Discord". */
  label: string
  /** Rota para onde redirecionar após autenticar. Default: "/forum". */
  next?: string
  /** Ícone do provedor. */
  icon: ReactNode
}

export function OAuthButton({ provider, label, next = "/forum", icon }: OAuthButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    // `access_type`/`prompt=select_account` são parâmetros do Google; o Discord
    // usa outro conjunto e ignora/rejeita esses valores, então só enviamos no
    // fluxo do Google.
    const queryParams =
      provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined

    const { error: oauthError } = await supabaseAuth.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams,
      },
    })

    // Em caso de sucesso o navegador é redirecionado para o provedor, então o
    // código abaixo só roda quando algo falhou (provider desabilitado, URL de
    // redirect não autorizada no Supabase, rede, etc.).
    if (oauthError) {
      setError("Não foi possível conectar. Tente novamente.")
      setLoading(false)
      // Log útil no console para diagnosticar configuração do Supabase/provedor.
      console.error(`[OAuthButton:${provider}] signInWithOAuth falhou:`, oauthError.message)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {icon}
        {loading ? "Conectando…" : label}
      </button>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
