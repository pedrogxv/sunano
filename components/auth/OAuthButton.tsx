"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { AuthAlert } from "@/components/auth/auth-form-ui"
import { DiscordIcon, GoogleIcon } from "@/components/auth/provider-icons"
import { supabaseAuth } from "@/lib/client/supabase-auth"
import { cn } from "@/lib/utils"

type OAuthProvider = "google" | "discord"

/** Provedores na ordem em que aparecem. Provedor novo entra aqui, e só aqui. */
const PROVIDERS: { id: OAuthProvider; name: string; icon: React.ReactNode }[] = [
  { id: "google", name: "Google", icon: <GoogleIcon className="size-[18px] shrink-0" /> },
  { id: "discord", name: "Discord", icon: <DiscordIcon className="size-[18px] shrink-0" /> },
]

const INTENT_VERB = { login: "Continuar com", register: "Cadastrar com" } as const

/**
 * Login social, os dois provedores lado a lado. Lado a lado (e não um embaixo
 * do outro) porque é o caminho mais curto para entrar: no celular, empilhados,
 * eles e o divisor empurravam o formulário de email para fora da gaveta.
 * O nome do provedor é o rótulo visível; o verbo completo ("Continuar com
 * Google") vai para o leitor de tela.
 *
 * Um erro só para o grupo: com um por botão, o aviso quebrava a grade.
 */
export function OAuthButtons({ intent, next = "/forum" }: { intent: keyof typeof INTENT_VERB; next?: string }) {
  const [loading, setLoading] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function signIn(provider: OAuthProvider) {
    setLoading(provider)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    // `access_type`/`prompt=select_account` são parâmetros do Google; o Discord
    // usa outro conjunto e ignora/rejeita esses valores, então só enviamos no
    // fluxo do Google.
    const queryParams =
      provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined

    const { error: oauthError } = await supabaseAuth.auth.signInWithOAuth({
      provider,
      options: { redirectTo, queryParams },
    })

    // Em caso de sucesso o navegador é redirecionado para o provedor, então o
    // código abaixo só roda quando algo falhou (provider desabilitado, URL de
    // redirect não autorizada no Supabase, rede, etc.).
    if (oauthError) {
      setError("Não foi possível conectar. Tente novamente.")
      setLoading(null)
      console.error(`[OAuthButtons:${provider}] signInWithOAuth falhou:`, oauthError.message)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => signIn(p.id)}
            disabled={loading !== null}
            aria-label={`${INTENT_VERB[intent]} ${p.name}`}
            className={cn(
              "flex h-11 items-center justify-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 text-sm font-semibold text-foreground transition-[background-color,border-color,transform] hover:border-foreground/20 hover:bg-muted/40 active:scale-[0.97] disabled:cursor-not-allowed",
              loading !== null && loading !== p.id && "opacity-50"
            )}
          >
            {loading === p.id ? <Loader2 className="size-[18px] animate-spin" /> : p.icon}
            {p.name}
          </button>
        ))}
      </div>
      {error && <AuthAlert>{error}</AuthAlert>}
    </div>
  )
}
