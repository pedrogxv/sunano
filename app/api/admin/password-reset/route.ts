import { NextResponse } from "next/server"

import { verifyTurnstileToken } from "@/lib/server/integrations/turnstile"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { SITE_URL } from "@/lib/site-url"

// Captcha + dois tetos (por cliente e por e-mail) porque esta rota é pública
// e cada chamada aceita dispara um e-mail pelo provedor padrão do Supabase,
// cuja cota é do projeto inteiro: sem isso, poucas requisições anônimas por
// hora esgotavam a cota e ninguém mais conseguia recuperar senha nem
// confirmar cadastro. O teto por e-mail não depende de IP nem de User-Agent,
// então trocar de rede não renova a contagem de um mesmo alvo.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email || "").trim()

    if (!email) {
      return NextResponse.json({ message: "Email enviado." })
    }

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const captcha = await verifyTurnstileToken(
      typeof body?.turnstileToken === "string" ? body.turnstileToken : null,
      clientIp
    )
    if (!captcha.success) {
      // Único caso que não responde de forma genérica: o formulário precisa
      // saber que deve pedir o captcha de novo. Não revela nada sobre a conta.
      return NextResponse.json({ error: "captcha_failed" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase()
    const identifier = getClientIdentifier(request)
    const [perClient, perEmail] = await Promise.all([
      checkRateLimit({
        action: "admin_password_reset",
        identifier: `${identifier}:${normalizedEmail}`,
        maxAttempts: 5,
        windowSeconds: 900,
        onError: "closed",
      }),
      checkRateLimit({
        action: "password_reset_email",
        identifier: normalizedEmail,
        maxAttempts: 3,
        windowSeconds: 3600,
        onError: "closed",
      }),
    ])
    if (!perClient.allowed || !perEmail.allowed) {
      // Resposta genérica de propósito — não revela rate limit a quem tenta abusar.
      return NextResponse.json({ message: "Email enviado." })
    }

    const supabase = await createSupabaseServerClient()
    // `SITE_URL` de lib/site-url.ts, nunca `NEXT_PUBLIC_APP_URL` direto: em
    // produção a env estava setada como http://localhost:3000, e o link de
    // recuperação sairia apontando para localhost. `SITE_URL` ignora um
    // localhost em produção em favor do domínio real.
    const redirectTo = `${SITE_URL}/auth/callback?type=recovery`

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    return NextResponse.json({ message: "Email enviado." })
  } catch {
    return NextResponse.json({ message: "Email enviado." })
  }
}
