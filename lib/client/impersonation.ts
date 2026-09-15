import { toast } from "sonner"

import { IMPERSONATION_ACTIVE_COOKIE } from "@/lib/impersonation-shared"

export type ImpersonationActiveState = { target: string; expiresAt: number }

/** Mensagem única para ação barrada durante a sessão de acesso. */
export const IMPERSONATION_READ_ONLY_MESSAGE = "Sessão de acesso é somente leitura."

/**
 * Lê o cookie `imp-active` (não httpOnly, sem segredo: só nome do alvo e
 * expiração). `null` fora de uma sessão de acesso, inclusive depois de
 * encerrada, quando o cookie fica com valor vazio.
 */
export function readImpersonationActiveCookie(): ImpersonationActiveState | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${IMPERSONATION_ACTIVE_COOKIE}=`))
  if (!match) return null
  try {
    const raw = decodeURIComponent(match.slice(IMPERSONATION_ACTIVE_COOKIE.length + 1))
    const parsed = JSON.parse(raw) as ImpersonationActiveState
    if (!parsed || typeof parsed.expiresAt !== "number") return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Sessão de acesso ativa neste navegador.
 *
 * O proxy deixa a sessão de acesso somente leitura barrando método de escrita
 * nas rotas do Next. Algumas telas, porém, falam direto com o Supabase Auth
 * pelo navegador (vincular conta, 2FA, encerrar sessões, OAuth das conquistas)
 * e nunca passam pelo proxy. Essas telas checam isto antes de agir.
 */
export function isImpersonationActive(): boolean {
  return readImpersonationActiveCookie() !== null
}

/** Para handlers de clique: avisa e devolve `true` quando a ação deve parar. */
export function denyDuringImpersonation(): boolean {
  if (!isImpersonationActive()) return false
  toast.error(IMPERSONATION_READ_ONLY_MESSAGE)
  return true
}
