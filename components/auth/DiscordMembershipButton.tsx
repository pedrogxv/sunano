"use client"

import { useState } from "react"

import { DiscordIcon } from "@/components/auth/provider-icons"
import { supabaseAuth } from "@/lib/client/supabase-auth"
import { cn } from "@/lib/utils"

interface DiscordMembershipButtonProps {
  requireLogin?: () => boolean
  className?: string
}

/**
 * Dispara o OAuth do Discord pedindo o scope extra `guilds` (não usado no
 * login normal, ver components/auth/OAuthButton.tsx) e volta para um callback
 * dedicado (app/auth/discord/callback/route.ts) que confere a participação no
 * servidor e credita a recompensa.
 *
 * `prompt: "consent"` força o Discord a sempre devolver o access token, mesmo
 * que a conta já tenha autorizado o app antes só com os scopes básicos do
 * login — sem isso o callback recebe `provider_token` nulo e não tem como
 * consultar `/users/@me/guilds`. Mesmo motivo do YoutubeSubscribeButton.
 *
 * Vale para os dois casos, e é por isso que é UM botão só: quem ainda não tem
 * Discord vinculado sai daqui com a conta conectada (aparece em /conta >
 * Contas vinculadas); quem já tem só confirma a participação.
 */
export function DiscordMembershipButton({ requireLogin, className }: DiscordMembershipButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (requireLogin && !requireLogin()) return
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/discord/callback?next=${encodeURIComponent(window.location.pathname)}`

    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
        scopes: "identify guilds",
        queryParams: { prompt: "consent" },
      },
    })

    if (error) {
      console.error("[DiscordMembershipButton] signInWithOAuth falhou:", error.message)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      <DiscordIcon className="size-4 shrink-0" fill="currentColor" />
      {loading ? "Conectando…" : "Conectar Discord"}
    </button>
  )
}
