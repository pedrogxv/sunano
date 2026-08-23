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
 * provisionado (ex.: dev local). Configure a env em produção para ativar de
 * fato a proteção.
 */
export async function verifyTurnstileToken(
  token: string | null,
  remoteIp: string | null
): Promise<{ success: boolean; skipped: boolean }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
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
