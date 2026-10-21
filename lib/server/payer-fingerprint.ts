import "server-only"

import { createHmac } from "crypto"

/**
 * Impressão digital do CPF/CNPJ do pagador, gravada em
 * `store_orders.payer_document_hash`: liga pedidos de contas diferentes à
 * mesma pessoa (limite por cliente, `max_per_customer`) sem guardar mais um
 * documento em texto puro.
 *
 * HMAC com segredo do servidor, não SHA puro: CPF tem só 11 dígitos, e um hash
 * sem chave se reverte por força bruta em minutos. A chave é
 * `PAYER_FINGERPRINT_SECRET`, ou, sem ela, derivada de `RATE_LIMIT_SALT`
 * (obrigatória em produção). Trocar a chave "esquece" o histórico: o limite
 * volta a contar do zero para quem já comprou.
 */
function fingerprintKey(): string {
  const dedicated = process.env.PAYER_FINGERPRINT_SECRET
  if (dedicated) return dedicated
  const salt = process.env.RATE_LIMIT_SALT
  if (salt) return `payer-document:${salt}`
  if (process.env.NODE_ENV === "production") {
    throw new Error("PAYER_FINGERPRINT_SECRET/RATE_LIMIT_SALT ausente em produção.")
  }
  return "payer-document:dev"
}

export function payerDocumentFingerprint(document: string): string | null {
  const digits = document.replace(/\D/g, "")
  if (digits.length !== 11 && digits.length !== 14) return null
  return createHmac("sha256", fingerprintKey()).update(digits).digest("hex")
}
