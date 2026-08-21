"use server"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { headers } from "next/headers"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"

type State = { error: string | null; success: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function forgotPasswordAction(_: State, formData: FormData): Promise<State> {
  const email = String(formData.get("email") || "").trim().toLowerCase()

  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Informe um email válido.", success: false }
  }

  const headersList = await headers()
  // `origin` nem sempre é enviado; reconstrói a partir do host quando faltar.
  const host = headersList.get("host") ?? ""
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const origin = headersList.get("origin") || (host ? `${proto}://${host}` : "")

  const identifier = getClientIdentifierFromHeaders(headersList)
  const rateLimit = await checkRateLimit({
    action: "forgot_password",
    identifier: `${identifier}:${email}`,
    maxAttempts: 5,
    windowSeconds: 300,
  })
  if (!rateLimit.allowed) {
    return { error: "Muitas tentativas. Aguarde alguns minutos antes de pedir um novo link.", success: false }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  })

  if (error) {
    // Loga o erro real no servidor para diagnóstico (não expõe ao cliente).
    console.error("[forgot-password] resetPasswordForEmail falhou:", error.status, error.message)

    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      return {
        error: "Muitas tentativas. Aguarde alguns minutos antes de pedir um novo link.",
        success: false,
      }
    }

    return { error: "Não foi possível enviar o email. Tente novamente.", success: false }
  }

  return { error: null, success: true }
}
