import "server-only"

/**
 * Verificação server-side do Cloudflare Turnstile (login e cadastro).
 *
 * O widget client-side gera um token de uso único; aqui ele é validado contra
 * a API do Cloudflare com a secret key, que nunca deve chegar ao browser.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type TurnstileVerifyResponse = {
  success: boolean
  "error-codes"?: string[]
}

/**
 * Sem `TURNSTILE_SECRET_KEY` configurada, falha aberto (permite passar) em vez
 * de derrubar login/cadastro em ambientes onde o captcha ainda não foi
 * provisionado (ex.: dev local).
 *
 * Em produção isso NÃO vale: a env ausente lá significa que o captcha está
 * desligado sem ninguém perceber — o widget não renderiza, o token chega
 * vazio, e esta função aprovava a requisição mesmo assim, deixando cadastro
 * em massa e credential stuffing com apenas o rate limit por IP pela frente.
 * Foi o que aconteceu em produção até 28/08/2026. Agora a ausência da env em
 * produção recusa a requisição, para que a falha apareça em vez de silenciar
 * a proteção.
 */
export async function verifyTurnstileToken(
  token: string | null,
  remoteIp: string | null
): Promise<{ success: boolean; skipped: boolean }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY ausente em produção — recusando a requisição.")
      return { success: false, skipped: false }
    }
    return { success: true, skipped: true }
  }

  if (!token) {
    return { success: false, skipped: false }
  }

  try {
    const body = new URLSearchParams({ secret: secretKey, response: token })
    if (remoteIp) body.set("remoteip", remoteIp)

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })

    if (!response.ok) {
      console.error("[turnstile] siteverify respondeu status", response.status)
      return { success: false, skipped: false }
    }

    const data = (await response.json()) as TurnstileVerifyResponse
    if (!data.success) {
      console.error("[turnstile] verificação falhou:", data["error-codes"]?.join(", "))
    }
    return { success: data.success, skipped: false }
  } catch (err) {
    console.error("[turnstile] siteverify lançou exceção:", err)
    return { success: false, skipped: false }
  }
}
