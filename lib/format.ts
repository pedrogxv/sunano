/**
 * Helpers puros de formatação/slug — seguros para cliente e servidor.
 *
 * NÃO importa SDKs de gateway nem segredos. O cliente MisticPay (que usa a
 * chave secreta) vive em `lib/server/integrations/misticpay.ts` e é `server-only`.
 */

/**
 * Moeda em BRL com os centavos SEMPRE visíveis ("R$ 700,00", nunca "R$ 700").
 * Preço truncado dá a impressão de que o valor mudou entre a vitrine e o
 * checkout, então todo o fluxo da loja mostra as duas casas decimais.
 *
 * Use `formatCurrencyBRLCompact` só onde o espaço é o problema (eixo de
 * gráfico), nunca em preço que o cliente vai pagar.
 */
export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Variante que omite ",00" em valores redondos. Só para rótulos apertados. */
export function formatCurrencyBRLCompact(value: number): string {
  const hasCents = Math.round(value * 100) % 100 !== 0
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(value)
}

export function formatBRL(cents: number): string {
  return formatCurrencyBRL(cents / 100)
}

/** `formatBRL` sem os centavos redundantes. Só para rótulos apertados. */
export function formatBRLCompact(cents: number): string {
  return formatCurrencyBRLCompact(cents / 100)
}

export function parseSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}
