import "server-only"

/**
 * Cliente REST do Resend (e-mail transacional) — SERVIDOR APENAS.
 *
 * Só o que a loja precisa: enviar um e-mail. Sem SDK: é um POST, e o
 * pacote oficial não acrescenta nada além de peso no bundle da function.
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 *
 * DESLIGADO POR PADRÃO: sem `RESEND_API_KEY` toda função vira no-op, igual
 * ao Discord. A Loja precisa funcionar exatamente igual com o e-mail fora do
 * ar, em dev local e antes de o domínio ser verificado no Resend.
 *
 * O remetente (`RESEND_FROM`) precisa ser de um domínio VERIFICADO no Resend
 * — com domínio não verificado a API responde 403 e nada sai.
 */

const API_URL = "https://api.resend.com/emails"

/** Timeout curto: e-mail nunca pode segurar a resposta de um webhook. */
const REQUEST_TIMEOUT_MS = 8000

const DEFAULT_FROM = "Sunano <pedidos@sunano.com.br>"

export type ResendConfig = {
  apiKey: string
  from: string
  replyTo: string | null
}

export function getResendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null

  return {
    apiKey,
    from: process.env.RESEND_FROM?.trim() || DEFAULT_FROM,
    replyTo: process.env.RESEND_REPLY_TO?.trim() || null,
  }
}

export class ResendApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "ResendApiError"
  }
}

export type SendEmailParams = {
  config: ResendConfig
  to: string
  subject: string
  html: string
  text: string
  /**
   * Chave de idempotência do Resend (janela de 24h). A mesma chave nunca
   * vira dois e-mails — é o que segura reentrega de webhook e corrida entre
   * os eventos CONFIRMED/RECEIVED da Asaas.
   */
  idempotencyKey?: string
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const { config } = params

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(params.idempotencyKey && { "Idempotency-Key": params.idempotencyKey }),
    },
    body: JSON.stringify({
      from: config.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(config.replyTo && { reply_to: config.replyTo }),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new ResendApiError(response.status, `Resend HTTP ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = (await response.json()) as { id?: string }
  return { id: data.id ?? "" }
}
