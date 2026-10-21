import "server-only"

import { humanizeDbError } from "@/lib/db-errors"

/**
 * Escapa aspas/backslash e envolve em aspas duplas — sintaxe do PostgREST
 * para valores de filtro que podem conter vírgula/ponto (delimitadores do
 * `.or()`), evitando que o termo de busca injete condições extras no filtro.
 */
export function escapeOrFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * Escapa os curingas do LIKE (`%` e `_`) e a própria barra, para o termo
 * digitado ser buscado literalmente. Sem isso, buscar "_" ou "%" casa com
 * todas as linhas e força varredura da tabela inteira.
 *
 * Dentro de `.or()`, aplique `escapeOrFilterValue` por cima deste: o
 * PostgREST desfaz um nível de barra no valor entre aspas.
 *
 * O `*` vira `_`: em `like`/`ilike` o PostgREST troca todo `*` por `%` e não
 * tem escape para ele (`\*` vira `\%`, o sinal de porcento literal). Sem a
 * troca, um `*` no meio do termo cobria um trecho de qualquer tamanho; com
 * `_` ele vale um caractere só naquela posição, o próprio `*` incluído. Um
 * termo feito só de `*` continua casando com quase tudo, como qualquer termo
 * de uma letra.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "_")
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Só UUIDs válidos, sem repetição e limitados a `max`. Obrigatório antes de
 * interpolar ids vindos da query string em `.or()`: a lista de um `in.(...)`
 * dentro do `.or()` aceita `)` e `,` e deixa o chamador acrescentar condições
 * a qualquer coluna da tabela. UUID só tem hex e hífen, então não carrega
 * gramática do PostgREST.
 */
export function onlyUuids(values: string[], max = 500): string[] {
  return [...new Set(values.filter(isUuid))].slice(0, max)
}

/** SQLSTATE de `raise exception` sem errcode explícito (triggers do projeto). */
const PG_RAISE_EXCEPTION = "P0001"

/**
 * Mensagem de erro do banco que pode ir para o client.
 *
 * O texto cru do Postgres expõe nome de tabela, coluna e constraint (ex.:
 * `violates foreign key constraint "forum_comments_parent_comment_id_fkey"`)
 * na aba Network. O texto dos `raise exception` dos nossos triggers é escrito
 * para o usuário e passa adiante, sem o prefixo "tabela: " que alguns deles
 * usam. O resto vai por `humanizeDbError`, que já não vaza nomes; o erro
 * completo fica no log do servidor.
 */
export function publicDbErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string
): string {
  if (error?.code === PG_RAISE_EXCEPTION && error.message) {
    const text = error.message.replace(/^[a-z_]+:\s*/, "").trim()
    if (text) return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return humanizeDbError(error, fallback).message
}

export function clampPage(page: number | undefined): number {
  return Math.max(1, page ?? 1)
}

export function clampPageSize(pageSize: number | undefined, max = 60, fallback = 24): number {
  return Math.min(max, Math.max(1, pageSize ?? fallback))
}

export function rangeFor(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize
  return [from, from + pageSize - 1]
}

/**
 * Total de linhas quando a página pedida passou do fim (PostgREST `PGRST103`,
 * "An offset of 24 was requested, but there are only 3 rows"), ou `null`
 * para qualquer outro erro.
 *
 * Página além do total não é falha: é link antigo, filtro que encolheu a
 * listagem ou crawler testando `?page=N`. A listagem responde vazia com o
 * total verdadeiro (a paginação da tela continua certa) em vez de logar erro
 * e devolver `total: 0`.
 */
export function totalFromRangeError(error: { code?: string; details?: string | null } | null): number | null {
  if (error?.code !== "PGRST103") return null
  const match = /only (\d+) rows?/.exec(error.details ?? "")
  return match ? Number(match[1]) : 0
}

/**
 * A função SQL chamada por `.rpc()` não existe (ainda) no banco: PostgREST
 * `PGRST202` ("Could not find the function ... in the schema cache") ou
 * Postgres `42883`.
 *
 * É o caso de código publicado ANTES da migration que cria a função. Quem
 * troca um caminho antigo por uma RPC nova usa isto para cair no caminho
 * antigo em vez de derrubar a rota até alguém rodar `supabase db push`.
 */
export function isMissingDbFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883"
}
