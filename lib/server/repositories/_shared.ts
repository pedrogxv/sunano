import "server-only"

/**
 * Escapa aspas/backslash e envolve em aspas duplas — sintaxe do PostgREST
 * para valores de filtro que podem conter vírgula/ponto (delimitadores do
 * `.or()`), evitando que o termo de busca injete condições extras no filtro.
 */
export function escapeOrFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
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
