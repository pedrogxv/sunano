/**
 * Nome de exibição: regras de formato e derivação do slug público.
 *
 * O nome continua livre (espaços, acentos, maiúsculas), mas a *unicidade* é
 * decidida pelo slug — "João Silva", "joao silva" e "JOAO SILVA" colidem entre
 * si. O slug também é o que aparece na URL do perfil (`/perfil/joao-silva`).
 *
 * Este módulo é puro e roda nos dois lados (form de cadastro, API). A regra
 * equivalente existe no banco em `public.slugify_display_name` — as duas
 * implementações precisam andar juntas; o valor gravado é sempre o do banco,
 * que é a fonte da verdade.
 */

import { checkContent, CONTENT_FILTER_MESSAGE } from "@/lib/content-filter"

export const DISPLAY_NAME_MIN_LENGTH = 2
export const DISPLAY_NAME_MAX_LENGTH = 30
export const DISPLAY_SLUG_MIN_LENGTH = 2
export const DISPLAY_SLUG_MAX_LENGTH = 40

/** Espelha o `translate()` de `public.slugify_display_name`. */
// As duas linhas precisam ter o mesmo comprimento e casar posição a posição:
// 6 "a", "c", 4 "e", 4 "i", "n", 6 "o", 4 "u", 2 "y" = 28.
const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ"
const UNACCENTED = "aaaaaaceeeeiiiinoooooouuuuyy"

/** Ligaduras que viram duas letras — feitas antes do mapa 1:1. */
const LIGATURES: [RegExp, string][] = [
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/œ/g, "oe"],
]

/**
 * Nomes que ninguém pode registrar — evitam perfis que se passam pela
 * própria plataforma ou pela moderação.
 */
const RESERVED_SLUGS = new Set([
  "admin",
  "administrador",
  "moderador",
  "mod",
  "suporte",
  "support",
  "sunano",
  "staff",
  "oficial",
  "official",
  "root",
  "sistema",
  "system",
])

/** Deriva o identificador público a partir do nome de exibição. */
export function slugifyDisplayName(name: string): string {
  let value = (name ?? "").toLowerCase()
  for (const [pattern, replacement] of LIGATURES) {
    value = value.replace(pattern, replacement)
  }
  value = value.replace(/./g, (char) => {
    const index = ACCENTED.indexOf(char)
    return index === -1 ? char : UNACCENTED[index]
  })
  // A ordem espelha `slugify_display_name` no banco: colapsa, corta em 40 e só
  // então tira o "-" das pontas. Inverter isso faria os dois lados divergirem
  // em nomes longos que começam com separador.
  return value
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, DISPLAY_SLUG_MAX_LENGTH)
    .replace(/^-|-$/g, "")
}

/**
 * Valida o nome escolhido pelo usuário. Retorna a mensagem de erro, ou `null`
 * quando o nome serve.
 */
export function validateDisplayName(name: string): string | null {
  const trimmed = (name ?? "").trim()

  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
    return `O nome precisa ter pelo menos ${DISPLAY_NAME_MIN_LENGTH} caracteres.`
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return `O nome pode ter no máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres.`
  }

  const slug = slugifyDisplayName(trimmed)
  if (slug.length < DISPLAY_SLUG_MIN_LENGTH) {
    return "O nome precisa ter pelo menos duas letras ou números."
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "Esse nome é reservado. Escolha outro."
  }
  if (checkContent(trimmed).blocked) {
    return CONTENT_FILTER_MESSAGE
  }
  return null
}

/** URL pública do perfil a partir do slug. */
export function profilePath(slug: string): string {
  return `/perfil/${slug}`
}
