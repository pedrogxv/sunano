"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/**
 * Quando um link de confirmação/recuperação do Supabase já expirou ou já foi
 * usado, o GoTrue não consegue completar o redirect para `/auth/callback` —
 * ele falha antes disso e manda a pessoa para a Site URL (a home) com o erro
 * anexado como *hash fragment* (`#error=...`), não como query string. Um hash
 * nunca é enviado ao servidor, então isso só pode ser tratado no client, e só
 * depois que a página carrega — daí este componente global em vez de algo em
 * `app/auth/callback/route.ts`.
 */
const ERROR_MESSAGES: Record<string, string> = {
  otp_expired: "Esse link expirou. Solicite um novo e-mail de confirmação ou de redefinição de senha.",
  access_denied: "Esse link não é mais válido. Solicite um novo.",
}

export function AuthHashErrorListener() {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !hash.includes("error")) return

    const params = new URLSearchParams(hash.slice(1))
    const errorCode = params.get("error_code")
    const error = params.get("error")
    if (!error && !errorCode) return

    const message = (errorCode && ERROR_MESSAGES[errorCode]) || ERROR_MESSAGES.access_denied
    toast.error(message)

    // Limpa o hash para não repetir o toast num refresh ou voltar a página.
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
  }, [])

  return null
}
