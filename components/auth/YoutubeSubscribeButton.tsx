"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Youtube } from "lucide-react"

import { startScopedOAuth, YOUTUBE_SUBSCRIPTION_OAUTH } from "@/lib/client/start-scoped-oauth"
import { cn } from "@/lib/utils"

interface YoutubeSubscribeButtonProps {
  requireLogin?: () => boolean
  className?: string
}

/**
 * Dispara o OAuth do Google pedindo o scope extra `youtube.readonly` (não
 * usado no login normal, ver components/auth/OAuthButton.tsx) e volta para
 * um callback dedicado (app/auth/youtube/callback/route.ts) que confere a
 * inscrição e credita a recompensa. Vincular ou reautenticar sem trocar de
 * conta: ver lib/client/start-scoped-oauth.ts.
 */
export function YoutubeSubscribeButton({ requireLogin, className }: YoutubeSubscribeButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (requireLogin && !requireLogin()) return
    setLoading(true)

    const errorMessage = await startScopedOAuth(YOUTUBE_SUBSCRIPTION_OAUTH, window.location.pathname)
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
        "flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      <Youtube className="size-4 shrink-0" />
      {loading ? "Conectando…" : "Confirmar inscrição"}
    </button>
  )
}
