import "server-only"

import { createHash } from "crypto"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Rate limiting baseado na tabela `rate_limit_events`.
 *
 * Faz parte da camada de domínio (`server-only`): cria o próprio cliente de
 * banco, então as rotas não precisam manipular o Supabase diretamente.
 */

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds?: number
  /** Id da tentativa registrada, para `refundRateLimitAttempt`. */
  attemptId?: string | null
}

type RateLimitParams = {
  action: string
  identifier: string
  maxAttempts: number
  windowSeconds: number
}

/** Deriva um identificador estável (hash) do visitante a partir dos headers. */
export function getClientIdentifierFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")
  const realIp = headers.get("x-real-ip")
  const userAgent = headers.get("user-agent")
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown"
  const salt = process.env.RATE_LIMIT_SALT || "sunano-rate-limit"

  return createHash("sha256").update(`${salt}:${ip}:${userAgent || "unknown"}`).digest("hex")
}

/** Deriva um identificador estável (hash) do visitante a partir da requisição. */
export function getClientIdentifier(request: Request) {
  return getClientIdentifierFromHeaders(request.headers)
}

/** Verifica e registra uma tentativa para a janela de tempo informada. */
export async function checkRateLimit({
  action,
  identifier,
  maxAttempts,
  windowSeconds,
}: RateLimitParams): Promise<RateLimitResult> {
  const supabase = createSupabaseAdminClient()
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()

  const { count, error } = await supabase
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("action", action)
    .eq("identifier", identifier)
    .gte("created_at", since)

  if (error) {
    return { allowed: true }
  }

  if ((count ?? 0) >= maxAttempts) {
    return { allowed: false, retryAfterSeconds: windowSeconds }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: attempt } = await (supabase
    .from("rate_limit_events")
    .insert({ action, identifier } as any)
    .select("id")
    .maybeSingle() as any)
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { allowed: true, attemptId: (attempt as { id: string } | null)?.id ?? null }
}

/**
 * Descarta uma tentativa registrada por `checkRateLimit`.
 *
 * Serve para o caso em que a operação falhou por culpa do servidor (provedor
 * de e-mail sem cota, banco fora do ar): quem tentou não fez nada errado, então
 * a tentativa não pode consumir a cota da pessoa. Sem isso, algumas tentativas
 * durante uma indisponibilidade trocam o erro real por "muitas tentativas" e
 * ainda trancam a pessoa por uma hora.
 */
export async function refundRateLimitAttempt(attemptId: string | null | undefined): Promise<void> {
  if (!attemptId) return
  const supabase = createSupabaseAdminClient()
  await supabase.from("rate_limit_events").delete().eq("id", attemptId)
}
