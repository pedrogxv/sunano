/**
 * Prazo de pré-venda e Lançamento (migration 20261220000000). Módulo puro: o
 * card, a página do produto e o form do admin leem a regra DAQUI, para a
 * contagem dizer a mesma coisa em toda tela.
 *
 * O produto fica em pré-venda/lançamento até `endsAt` e, nesse instante, vira
 * produto normal. Quem faz a troca (e muda o preço) é o banco
 * (`close_store_sale_windows`, cron de 5 em 5 minutos); a tela só conta.
 */

export type SaleWindowEndAction = "keep" | "end_promo" | "set_price"

export const SALE_WINDOW_END_ACTIONS: readonly SaleWindowEndAction[] = ["keep", "end_promo", "set_price"]

export function isSaleWindowEndAction(value: unknown): value is SaleWindowEndAction {
  return typeof value === "string" && (SALE_WINDOW_END_ACTIONS as readonly string[]).includes(value)
}

/** Rótulo do admin para cada escolha. */
export const SALE_WINDOW_END_ACTION_LABEL: Record<SaleWindowEndAction, string> = {
  keep: "Só vira produto normal (mesmo preço)",
  end_promo: "Tira o desconto (volta ao preço cheio)",
  set_price: "Muda para outro preço",
}

export type SaleWindow = {
  /** Fim do prazo (ISO). */
  endsAt: string
  endAction: SaleWindowEndAction
  /** Preço PIX depois do prazo, só em `set_price`. */
  endPriceCents: number | null
}

export type SaleWindowKind = "preorder" | "launch"

/** Atalhos de duração do form ("durante X dias"). */
export const SALE_WINDOW_PRESET_DAYS = [3, 7, 15, 30] as const

/** Monta o prazo da linha do banco; `null` = sem prazo. */
export function toSaleWindow(row: {
  sale_window_ends_at?: string | null
  sale_window_end_action?: string | null
  sale_window_end_price_cents?: number | null
}): SaleWindow | null {
  if (!row.sale_window_ends_at) return null
  const endAction = isSaleWindowEndAction(row.sale_window_end_action) ? row.sale_window_end_action : "keep"
  return {
    endsAt: row.sale_window_ends_at,
    endAction,
    endPriceCents: endAction === "set_price" ? (row.sale_window_end_price_cents ?? null) : null,
  }
}

/**
 * Texto antes do relógio. Quando o preço muda no fim, a contagem é do PREÇO
 * ("o desconto acaba"), que é a urgência real; quando não muda, é só a saída
 * da seção.
 */
export function saleWindowCountdownLabel(kind: SaleWindowKind, endAction: SaleWindowEndAction): string {
  const priceChanges = endAction !== "keep"
  if (kind === "preorder") return priceChanges ? "Preço de pré-venda acaba em" : "Pré-venda termina em"
  return priceChanges ? "Preço de lançamento acaba em" : "Lançamento termina em"
}

/**
 * Preço PIX que passa a valer no fim do prazo, ou `null` quando não muda.
 * `end_promo` volta ao preço cheio (`baseCents`); `set_price` é o valor do admin.
 */
export function saleWindowPriceAfter(window: SaleWindow, baseCents: number, effectiveCents: number): number | null {
  if (window.endAction === "end_promo") return baseCents !== effectiveCents ? baseCents : null
  if (window.endAction === "set_price" && window.endPriceCents != null) {
    return window.endPriceCents !== effectiveCents ? window.endPriceCents : null
  }
  return null
}

/** Lançamento marcado no admin e ainda dentro do prazo (sem prazo = até desmarcar). */
export function isLaunchActive(
  product: { is_launch?: boolean | null; sale_window_ends_at?: string | null },
  nowMs: number
): boolean {
  if (!product.is_launch) return false
  return !product.sale_window_ends_at || Date.parse(product.sale_window_ends_at) > nowMs
}

/** "2d 04h 12m" / "04:12:33" (menos de um dia mostra segundos, que é onde a urgência está). */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(Math.floor(remainingMs / 1000), 0)
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
