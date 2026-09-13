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
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
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
