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
  /**
   * O que fazer quando a consulta ao banco falha.
   *
   * O limiter depende do mesmo Postgres que ele protege, então um pico de
   * carga que degrade o banco desligaria todo o throttling exatamente quando
   * ele é mais necessário — quanto mais pressão, menos proteção.
   *
   * `"closed"` recusa a requisição nesse cenário e é o padrão para ações
   * sensíveis (login, cadastro, checkout, recuperação de senha), onde deixar
   * passar sem contagem é pior que negar. `"open"` deixa passar e fica para
   * o resto, onde bloquear causa mais dano ao usuário legítimo do que
   * permitir causa ao site (ex.: consulta de CEP, votos, comentários).
   */
  onError?: "open" | "closed"
}

/**
 * Segredo que entra no hash do identificador.
 *
 * O fallback literal é público (está neste arquivo, versionado): com ele,
 * qualquer pessoa consegue recalcular o identificador de um visitante a
 * partir de IP + User-Agent e, sabendo disso, sondar ou envenenar a contagem
 * de terceiros. Serve só para o dev local não precisar de configuração; em
 * produção a env é obrigatória e a ausência dela é erro, não fallback.
 */
function getRateLimitSalt() {
  const salt = process.env.RATE_LIMIT_SALT
  if (salt) return salt

  if (process.env.NODE_ENV === "production") {
    throw new Error("RATE_LIMIT_SALT não configurado em produção.")
  }
  return "sunano-rate-limit"
}

/** Deriva um identificador estável (hash) do visitante a partir dos headers. */
export function getClientIdentifierFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")
  const realIp = headers.get("x-real-ip")
  const userAgent = headers.get("user-agent")
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown"

  return createHash("sha256").update(`${getRateLimitSalt()}:${ip}:${userAgent || "unknown"}`).digest("hex")
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
  onError = "open",
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
    console.error(`[rate-limit] consulta falhou (action=${action}, política=${onError}):`, error.message)
    if (onError === "closed") {
      return { allowed: false, retryAfterSeconds: 60 }
    }
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
