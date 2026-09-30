/**
 * Tipos dos Eventos (campanhas que concedem medalhas automaticamente).
 *
 * Vive fora de `lib/server/**` pelo mesmo motivo de `lib/profile-showcase.ts`:
 * módulo puro, sem acesso a dados, para Client Components (form do admin)
 * poderem importar os tipos sem puxar código de servidor.
 */

import type { MedalRarity } from "@/lib/profile-showcase"

export type EventCriteriaType =
  | "first_n_signups"
  | "manual_opt_in"
  | "aura_redeem"
  | "staff_grant"
  | "store_purchase"

/**
 * O que personaliza o card de `store_purchase` para o dono: o produto do
 * pedido que dá direito à medalha. Vem de `user_medal_purchases` (tabela
 * privada) e é trocado pelo trigger de `store_orders` quando o pedido deixa
 * de valer — ver 20261210000000_store_purchase_medal.sql.
 */
export type PurchaseCard = {
  productName: string | null
  productImageUrl: string | null
}

/** Frase do card personalizado — a mesma na vitrine do perfil e em /conquistas. */
export function purchaseCardCaption(card: PurchaseCard): string {
  return card.productName
    ? `Comprou ${card.productName} na Loja Sunano.`
    : "Cliente da Loja Sunano."
}

/**
 * Evento com os dados da medalha já resolvidos (join com `medals`) — é o que
 * a página pública `/eventos` e a lista do admin consomem. `events` não
 * duplica nome/descrição/imagem: eles vêm sempre da medalha vinculada.
 */
export type EventDisplay = {
  id: string
  slug: string
  medalId: string
  name: string
  description: string | null
  imageUrl: string | null
  rarity: MedalRarity
  criteriaType: EventCriteriaType
  /** `null` quando as vagas são ilimitadas — só faz sentido pra `aura_redeem`. */
  maxParticipants: number | null
  currentCount: number
  /** Custo em Aura pra resgatar — só usado por `aura_redeem`. */
  auraCost: number | null
  /** Só usuários com VIP ativo recebem/podem resgatar — vale para os outros 3 critérios. */
  requiresVip: boolean
  active: boolean
  startDate: string
  endDate: string | null
  /** Ordem de exibição em `/conquistas` e na Home — menor aparece primeiro. */
  sortOrder: number
}

/**
 * Rótulo de uma palavra — a faixa de "tipo" do card de medalha, onde uma
 * carta colecionável traria o tipo/estágio. O `EVENT_CRITERIA_LABEL` abaixo
 * é a frase explicativa do admin e não cabe ali.
 */
export const EVENT_CRITERIA_SHORT_LABEL: Record<EventCriteriaType, string> = {
  first_n_signups: "Cadastro",
  manual_opt_in: "Resgate",
  aura_redeem: "Aura",
  staff_grant: "Staff",
  store_purchase: "Compra",
}

/** Rótulo curto do critério, usado no admin e na página pública. */
export const EVENT_CRITERIA_LABEL: Record<EventCriteriaType, string> = {
  first_n_signups: "Primeiros N usuários cadastrados no site",
  manual_opt_in: "Resgate manual (usuário clica em Resgatar)",
  aura_redeem: "Resgate com Aura (desconta do saldo do usuário)",
  staff_grant: "Premiação da Staff (a equipe escolhe quem recebe)",
  store_purchase: "Compra na loja (quem tem pedido pago resgata; cancelou ou estornou, perde)",
}
