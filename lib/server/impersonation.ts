import "server-only"

import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"

import {
  IMPERSONATION_ACTIVE_COOKIE,
  IMPERSONATION_ORIGIN_COOKIE,
  IMPERSONATION_TTL_MS as SHARED_TTL,
} from "@/lib/impersonation-shared"

/**
 * "Logar como usuário" (impersonation) para o painel admin.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ BASE LEGAL (LGPD)                                                         │
 * │ O acesso à conta de um usuário pela equipe é tratamento de dado pessoal   │
 * │ (Art. 5º, X). A base é LEGÍTIMO INTERESSE / EXECUÇÃO DE CONTRATO          │
 * │ (Art. 7º, V e IX) — suporte técnico e diagnóstico de incidentes —, nunca  │
 * │ consentimento. Por isso o fluxo EXIGE um motivo por sessão, registra tudo │
 * │ em `audit_log` (Art. 37) e o escopo é SOMENTE LEITURA (Art. 6º, III —     │
 * │ minimização). Ver também a Política de Privacidade, seção sobre acesso    │
 * │ da equipe de suporte.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MECÂNICA
 * O `@supabase/ssr` mantém UMA sessão por navegador nos cookies
 * `sb-<ref>-auth-token(.N)`. Para impersonar sem perder a sessão do admin:
 *
 *   1. Antes de trocar a sessão, os cookies `sb-*` atuais do admin são
 *      serializados e guardados num cookie `imp-origin` — assinado com HMAC
 *      (jose, segredo = SUPABASE_SERVICE_ROLE_KEY) e `httpOnly`. Ninguém no
 *      browser consegue ler nem forjar.
 *   2. Uma sessão real do alvo é emitida (generateLink + verifyOtp) e grava os
 *      cookies `sb-*` por cima.
 *   3. Ao encerrar (ou expirar em `IMPERSONATION_TTL_MS`), os cookies do admin
 *      são restaurados a partir de `imp-origin` e o cookie é apagado.
 *
 * Um segundo cookie, `imp-active` (NÃO httpOnly, sem segredo — só nome do alvo
 * e expiração), existe só para o banner de aviso no client saber que a sessão
 * está ativa.
 */

const ORIGIN_COOKIE = IMPERSONATION_ORIGIN_COOKIE
const ACTIVE_COOKIE = IMPERSONATION_ACTIVE_COOKIE

/** Janela máxima de uma sessão impersonada. Curta de propósito (Art. 6º, III). */
export const IMPERSONATION_TTL_MS = SHARED_TTL

const alg = "HS256"

function secret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente — impersonation indisponível.")
  return new TextEncoder().encode(key)
}

/** Cookies `sb-*` (sessão) presentes na requisição atual, no formato {name,value}. */
export type StoredCookie = { name: string; value: string }

export type ImpersonationOrigin = {
  /** Admin (WEB MASTER) que iniciou a sessão. */
  adminId: string
  adminEmail: string | null
  /** Usuário-alvo sendo impersonado. */
  targetId: string
  targetEmail: string | null
  /** Motivo obrigatório informado pelo admin (Art. 6º, I — finalidade). */
  reason: string
  /** Chamado/ticket opcional. */
  ticket: string | null
  /** Epoch ms de início. */
  startedAt: number
  /** Cookies de sessão do admin, para restaurar ao encerrar. */
  adminCookies: StoredCookie[]
}

/**
 * Grava o cookie assinado com a sessão do admin + metadados. `expiresAt` do
 * cookie casa com o TTL: mesmo que o `/stop` nunca seja chamado, o cookie
 * some e o proxy trata a ausência como "não impersonando".
 */
export async function writeImpersonationOrigin(origin: ImpersonationOrigin): Promise<void> {
  const expSeconds = Math.floor((origin.startedAt + IMPERSONATION_TTL_MS) / 1000)

  const token = await new SignJWT({
    adminId: origin.adminId,
    adminEmail: origin.adminEmail,
    targetId: origin.targetId,
    targetEmail: origin.targetEmail,
    reason: origin.reason,
    ticket: origin.ticket,
    startedAt: origin.startedAt,
    adminCookies: origin.adminCookies,
  })
    .setProtectedHeader({ alg })
    .setIssuedAt(Math.floor(origin.startedAt / 1000))
    .setExpirationTime(expSeconds)
    .sign(secret())

  const store = await cookies()
  const commonOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(origin.startedAt + IMPERSONATION_TTL_MS),
  }

  store.set(ORIGIN_COOKIE, token, commonOpts)

  // Flag legível pelo client (banner). Sem segredo nenhum.
  store.set(
    ACTIVE_COOKIE,
    JSON.stringify({
      target: origin.targetEmail ?? origin.targetId,
      expiresAt: origin.startedAt + IMPERSONATION_TTL_MS,
    }),
    { ...commonOpts, httpOnly: false }
  )
}

/** Lê e valida o cookie de origem. `null` se ausente, inválido ou expirado. */
export async function readImpersonationOrigin(): Promise<ImpersonationOrigin | null> {
  const store = await cookies()
  const raw = store.get(ORIGIN_COOKIE)?.value
  if (!raw) return null

  try {
    const { payload } = await jwtVerify(raw, secret(), { algorithms: [alg] })
    const startedAt = Number(payload.startedAt)
    if (!Number.isFinite(startedAt)) return null
    if (Date.now() > startedAt + IMPERSONATION_TTL_MS) return null

    return {
      adminId: String(payload.adminId),
      adminEmail: (payload.adminEmail as string | null) ?? null,
      targetId: String(payload.targetId),
      targetEmail: (payload.targetEmail as string | null) ?? null,
      reason: String(payload.reason ?? ""),
      ticket: (payload.ticket as string | null) ?? null,
      startedAt,
      adminCookies: Array.isArray(payload.adminCookies)
        ? (payload.adminCookies as StoredCookie[])
        : [],
    }
  } catch {
    return null
  }
}

/** Remove os dois cookies de impersonation. */
export async function clearImpersonationCookies(): Promise<void> {
  const store = await cookies()
  const opts = { path: "/", expires: new Date(0) }
  store.set(ORIGIN_COOKIE, "", opts)
  store.set(ACTIVE_COOKIE, "", { ...opts, httpOnly: false })
}

export { IMPERSONATION_ORIGIN_COOKIE, IMPERSONATION_ACTIVE_COOKIE } from "@/lib/impersonation-shared"
