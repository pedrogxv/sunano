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

/**
 * Aura paga a quem pediu quando o pedido vira "added". Espelha
 * `trg_reward_peripheral_request_added` (20261203000000); o do banco é o que
 * vale. "duplicate" não paga: o periférico já estava na wiki.
 */
export const PERIPHERAL_REQUEST_AURA_REWARD = 10

/**
 * Respostas prontas do painel, por status. Trocar o status já preenche a
 * primeira (se a equipe não escreveu nada à mão); as outras ficam a um clique.
 * "pending" não tem: é o estado de quem ainda não foi olhado.
 */
export const PERIPHERAL_REQUEST_REPLY_PRESETS: Partial<Record<PeripheralRequestStatus, readonly string[]>> = {
  in_review: [
    "Recebemos seu pedido e já estamos levantando as informações para o cadastro.",
  ],
  added: [
    "Adicionado! Agradecemos o suporte, seu apoio é essencial para manter o site.",
    "Cadastrado na wiki! Obrigado por ajudar a deixar o catálogo mais completo.",
    "Pronto, já está na wiki. Valeu pela sugestão!",
  ],
  duplicate: [
    "Esse periférico já estava cadastrado na wiki. A ficha está ligada aqui no pedido. Obrigado mesmo assim!",
    "Já tínhamos este modelo na wiki, talvez com outro nome. Confira a ficha ligada ao pedido.",
  ],
  rejected: [
    "Não encontramos informações suficientes sobre este modelo para cadastrá-lo. Se tiver um link oficial, abra um novo pedido.",
    "O link enviado não abre ou não corresponde ao modelo pedido. Abra um novo pedido com o link correto.",
    "Esta categoria de produto não faz parte da wiki no momento.",
  ],
}

/** Número curto do "ticket", ex.: `#0042`. */
export function peripheralRequestNumber(number: number): string {
  return `#${String(number).padStart(4, "0")}`
}
