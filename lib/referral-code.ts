/**
 * Código de indicação: regras de formato e montagem do link.
 *
 * Mesmo formato de `lib/affiliate-code.ts` (só letras e números, maiúsculas),
 * porque os dois códigos viajam na querystring e são digitados à mão. A
 * diferença está em QUANDO existem: o de afiliado a pessoa escolhe e um admin
 * aprova; este nasce sozinho no primeiro acesso ao painel (`ensure_referral_code`)
 * e a personalização é opcional, uma vez só.
 *
 * Módulo puro — roda no servidor (validação de verdade) e no cliente (feedback
 * imediato no formulário), sem I/O.
 */

export const REFERRAL_CODE_MIN_LENGTH = 4
export const REFERRAL_CODE_MAX_LENGTH = 20

/** Espelha o `check` de `referral_codes.code` no banco. */
const CODE_PATTERN = /^[A-Z0-9]+$/

/**
 * Parâmetro na URL. Deliberadamente DIFERENTE do `?ref=` do programa de
 * afiliados (proxy.ts): os dois programas coexistem, e um mesmo link pode
 * carregar os dois sem que um sobrescreva o cookie do outro.
 */
export const REFERRAL_QUERY_PARAM = "convite"

/** Cookie de atribuição gravado pelo proxy. */
export const REFERRAL_COOKIE = "sn_inv_ref"

/** Janela de atribuição do cookie, em dias — igual à do afiliado. */
export const REFERRAL_COOKIE_DAYS = 30

/**
 * Recompensas. Espelham `referral_reward_direct()` / `referral_reward_indirect()`
 * no banco — aqui são só para EXIBIR. Quem credita de verdade é a RPC
 * `validate_referral`; se estes números divergirem, o banco é quem manda.
 */
export const REFERRAL_REWARD_DIRECT = 50
export const REFERRAL_REWARD_INDIRECT = 20

/** Prazo para o indicado cumprir o verificador (espelha `referral_validation_days()`). */
export const REFERRAL_VALIDATION_DAYS = 30

/** Teto de indicações validadas por usuário (espelha `referral_max_per_user()`). */
export const REFERRAL_MAX_PER_USER = 50

/** Dias de ofensiva que validam uma indicação pelo caminho `streak_3d`. */
export const REFERRAL_STREAK_DAYS = 3

/** Códigos que ninguém pode escolher — evitam links que se passam pela plataforma. */
const RESERVED_CODES = new Set([
  "ADMIN",
  "ADMINISTRADOR",
  "MODERADOR",
  "MOD",
  "SUPORTE",
  "SUPPORT",
  "SUNANO",
  "STAFF",
  "OFICIAL",
  "OFFICIAL",
  "ROOT",
  "SISTEMA",
  "SYSTEM",
  "CONVITE",
  "INDICACAO",
])

/** Normaliza o código digitado para o formato gravado/comparado no banco. */
export function normalizeReferralCode(code: string): string {
  return (code ?? "").trim().toUpperCase()
}

/**
 * Valida o formato do código escolhido. Retorna a mensagem de erro, ou `null`
 * quando serve (não checa disponibilidade — isso é assunto do `unique`).
 */
export function validateReferralCode(code: string): string | null {
  const normalized = normalizeReferralCode(code)

  if (normalized.length < REFERRAL_CODE_MIN_LENGTH) {
    return `O código precisa ter pelo menos ${REFERRAL_CODE_MIN_LENGTH} caracteres.`
  }
  if (normalized.length > REFERRAL_CODE_MAX_LENGTH) {
    return `O código pode ter no máximo ${REFERRAL_CODE_MAX_LENGTH} caracteres.`
  }
  if (!CODE_PATTERN.test(normalized)) {
    return "Use apenas letras e números, sem espaços ou símbolos."
  }
  if (RESERVED_CODES.has(normalized)) {
    return "Esse código é reservado. Escolha outro."
  }
  return null
}

/**
 * Monta o link de indicação. Aponta para `/register` de propósito (o afiliado
 * aponta para qualquer página, porque lá o objetivo é a compra): aqui o
 * objetivo é o cadastro, e o campo "Cupom de Indicação" já chega preenchido.
 */
export function buildReferralLink(siteUrl: string, code: string, path = "/register"): string {
  const base = siteUrl.replace(/\/+$/, "")
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`)
  url.searchParams.set(REFERRAL_QUERY_PARAM, normalizeReferralCode(code))
  return `${base}${url.pathname}${url.search}${url.hash}`
}
