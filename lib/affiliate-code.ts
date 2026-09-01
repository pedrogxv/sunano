/**
 * Código de referência do afiliado: regras de formato.
 *
 * Diferente do slug de nome de exibição, aqui não há derivação — o valor
 * digitado É o código (só normalizado para maiúsculas, já que a coluna
 * `affiliates.code` é `unique` e case-sensitive no Postgres). Módulo puro,
 * roda nos dois lados (form de solicitação e API).
 */

export const AFFILIATE_CODE_MIN_LENGTH = 4
export const AFFILIATE_CODE_MAX_LENGTH = 20

/** Só letras e números — evita colisão visual com `/`, espaços etc. no link `?ref=`. */
const CODE_PATTERN = /^[A-Z0-9]+$/

/** Códigos que ninguém pode escolher — evitam links que se passam pela própria plataforma. */
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
])

/** Normaliza o código digitado para o formato gravado/comparado no banco. */
export function normalizeAffiliateCode(code: string): string {
  return (code ?? "").trim().toUpperCase()
}

/**
 * Valida o formato do código escolhido. Retorna a mensagem de erro, ou `null`
 * quando o código serve (não checa disponibilidade — isso é assunto do banco).
 */
export function validateAffiliateCode(code: string): string | null {
  const normalized = normalizeAffiliateCode(code)

  if (normalized.length < AFFILIATE_CODE_MIN_LENGTH) {
    return `O código precisa ter pelo menos ${AFFILIATE_CODE_MIN_LENGTH} caracteres.`
  }
  if (normalized.length > AFFILIATE_CODE_MAX_LENGTH) {
    return `O código pode ter no máximo ${AFFILIATE_CODE_MAX_LENGTH} caracteres.`
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
 * Monta o link de indicação: o mesmo `path` que a pessoa está vendo, com
 * `?ref=CODIGO` anexado. O proxy grava o cookie de atribuição a partir desse
 * parâmetro em qualquer rota (`proxy.ts`), então dá para indicar a home, um
 * produto específico ou qualquer outra página.
 *
 * `path` pode vir com querystring/hash — o `ref` é anexado sem atropelar o
 * que já estiver lá, e substitui um `ref` anterior em vez de duplicar.
 */
export function buildAffiliateLink(siteUrl: string, code: string, path = "/"): string {
  const base = siteUrl.replace(/\/+$/, "")
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`)
  url.searchParams.set("ref", normalizeAffiliateCode(code))
  return `${base}${url.pathname}${url.search}${url.hash}`
}
