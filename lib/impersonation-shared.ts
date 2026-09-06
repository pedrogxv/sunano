/**
 * Constantes de impersonation compartilhadas entre o proxy (edge) e o server.
 *
 * Fica SEPARADO de `lib/server/impersonation.ts` porque aquele módulo é
 * `server-only` e usa `next/headers` — não pode ser importado no proxy.
 */

/** Cookie assinado (httpOnly) com a sessão do admin + metadados da sessão. */
export const IMPERSONATION_ORIGIN_COOKIE = "imp-origin"

/** Flag legível pelo client (não httpOnly, sem segredo) para o banner. */
export const IMPERSONATION_ACTIVE_COOKIE = "imp-active"

/** Janela máxima de uma sessão impersonada. Curta de propósito (LGPD Art. 6º, III). */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000
