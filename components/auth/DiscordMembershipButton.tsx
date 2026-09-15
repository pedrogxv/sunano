"use client"

import { useState } from "react"
import { toast } from "sonner"

import { DiscordIcon } from "@/components/auth/provider-icons"
import { DISCORD_MEMBERSHIP_OAUTH, startScopedOAuth } from "@/lib/client/start-scoped-oauth"
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
 * Vale para os dois casos, e é por isso que é UM botão só: quem ainda não tem
 * Discord vinculado sai daqui com a conta conectada (aparece em /conta >
 * Contas vinculadas); quem já tem só confirma a participação. A escolha entre
 * vincular e reautenticar fica em lib/client/start-scoped-oauth.ts.
 */
export function DiscordMembershipButton({ requireLogin, className }: DiscordMembershipButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (requireLogin && !requireLogin()) return
    setLoading(true)

    const errorMessage = await startScopedOAuth(DISCORD_MEMBERSHIP_OAUTH, window.location.pathname)
    if (errorMessage) {
      toast.error(errorMessage)
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
