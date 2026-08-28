import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email || "").trim()

    if (!email) {
      return NextResponse.json({ message: "Email enviado." })
    }

    const identifier = getClientIdentifier(request)
    const rateLimit = await checkRateLimit({
      action: "admin_password_reset",
      identifier: `${identifier}:${email.toLowerCase()}`,
      maxAttempts: 5,
      windowSeconds: 900,
      onError: "closed",
    })
    if (!rateLimit.allowed) {
      // Resposta genérica de propósito — não revela rate limit a quem tenta abusar.
      return NextResponse.json({ message: "Email enviado." })
    }

    const supabase = await createSupabaseServerClient()
    const siteUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    const redirectTo = `${siteUrl}/auth/callback?type=recovery`

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    return NextResponse.json({ message: "Email enviado." })
  } catch {
    return NextResponse.json({ message: "Email enviado." })
  }
}
