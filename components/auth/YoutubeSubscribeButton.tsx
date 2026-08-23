"use client"

import { useState } from "react"
import { Youtube } from "lucide-react"

import { supabaseAuth } from "@/lib/client/supabase-auth"
import { cn } from "@/lib/utils"

interface YoutubeSubscribeButtonProps {
  requireLogin?: () => boolean
  className?: string
}

/**
 * Dispara o OAuth do Google pedindo o scope extra `youtube.readonly` (não
 * usado no login normal, ver components/auth/OAuthButton.tsx) e volta para
 * um callback dedicado (app/auth/youtube/callback/route.ts) que confere a
 * inscrição e credita a recompensa. `prompt: "consent"` força o Google a
 * sempre devolver o access token, mesmo que a conta já tenha autorizado o
 * app antes só com os scopes básicos do login.
 */
export function YoutubeSubscribeButton({ requireLogin, className }: YoutubeSubscribeButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (requireLogin && !requireLogin()) return
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/youtube/callback?next=${encodeURIComponent(window.location.pathname)}`

    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: "https://www.googleapis.com/auth/youtube.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    })

    if (error) {
      console.error("[YoutubeSubscribeButton] signInWithOAuth falhou:", error.message)
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
