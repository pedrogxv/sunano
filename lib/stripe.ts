/**
 * Helpers puros de formatação/slug — seguros para cliente e servidor.
 *
 * NÃO importa o SDK do Stripe nem segredos. O cliente Stripe (que usa a
 * chave secreta) vive em `lib/server/integrations/stripe.ts` e é `server-only`.
 */

export function formatCurrencyBRL(value: number): string {
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
