import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Compara um segredo recebido com o esperado em tempo constante.
 *
 * Os dois lados passam por SHA-256 antes do `timingSafeEqual`: ele exige
 * buffers do mesmo tamanho, e checar o tamanho antes (como as rotas faziam)
 * devolve na hora quando o comprimento difere, o que vaza o tamanho do
 * segredo pelo tempo de resposta. `!==` é pior: vaza o prefixo.
 */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Requisição da Vercel Cron: a Vercel injeta `Authorization: Bearer
 * $CRON_SECRET` quando a env var existe. Sem ela, recusa (falha fechada).
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return secretsMatch(request.headers.get("authorization"), `Bearer ${secret}`)
}
