/**
 * Pedidos de cadastro de periférico ("o meu periférico não está no site").
 *
 * Módulo puro (sem `server-only`): o formulário, a lista e o painel leem
 * daqui os mesmos status, rótulos e limites. Os números de limite também
 * existem no banco (`peripheral_requests`, 20261130000000) — o do banco é o
 * que vale; mudar um sem o outro faz a tela prometer o que o banco recusa.
 */

export const PERIPHERAL_REQUEST_STATUSES = [
  "pending",
  "in_review",
  "added",
  "duplicate",
  "rejected",
  "cancelled",
] as const

export type PeripheralRequestStatus = (typeof PERIPHERAL_REQUEST_STATUSES)[number]

/** Ainda na fila: ocupa uma vaga do limite por pessoa e pode ser cancelado. */
export const OPEN_PERIPHERAL_REQUEST_STATUSES: readonly PeripheralRequestStatus[] = ["pending", "in_review"]

export function isPeripheralRequestOpen(status: PeripheralRequestStatus): boolean {
  return OPEN_PERIPHERAL_REQUEST_STATUSES.includes(status)
}

/** Pedidos em aberto por pessoa. Espelha `enforce_peripheral_request_cap` no banco. */
export const MAX_OPEN_PERIPHERAL_REQUESTS = 5

export const PERIPHERAL_REQUEST_LIMITS = {
  brand: 80,
  model: 120,
  url: 500,
  notes: 1000,
  response: 1000,
} as const

export const PERIPHERAL_REQUEST_STATUS_LABEL: Record<PeripheralRequestStatus, string> = {
  pending: "Na fila",
  in_review: "Em análise",
  added: "Cadastrado",
  duplicate: "Já existia",
  rejected: "Recusado",
  cancelled: "Cancelado",
}

export const PERIPHERAL_REQUEST_STATUS_STYLE: Record<PeripheralRequestStatus, string> = {
  pending: "bg-sky-500/15 text-sky-400",
  in_review: "bg-amber-500/15 text-amber-400",
  added: "bg-emerald-500/15 text-emerald-400",
  duplicate: "bg-violet-500/15 text-violet-400",
  rejected: "bg-rose-500/15 text-rose-400",
  cancelled: "bg-muted text-muted-foreground",
}

/** Frase para quem abriu o pedido, mostrada no detalhe. */
export const PERIPHERAL_REQUEST_STATUS_HINT: Record<PeripheralRequestStatus, string> = {
  pending: "Seu pedido está na fila. A equipe analisa por ordem de chegada.",
  in_review: "A equipe está cuidando do cadastro deste periférico.",
  added: "Este periférico já está na wiki.",
  duplicate: "Este periférico já estava cadastrado na wiki.",
  rejected: "A equipe não vai cadastrar este periférico.",
  cancelled: "Você cancelou este pedido.",
}

/** Número curto do "ticket", ex.: `#0042`. */
export function peripheralRequestNumber(number: number): string {
  return `#${String(number).padStart(4, "0")}`
}
