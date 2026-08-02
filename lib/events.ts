/**
 * Tipos dos Eventos (campanhas que concedem medalhas automaticamente).
 *
 * Vive fora de `lib/server/**` pelo mesmo motivo de `lib/profile-showcase.ts`:
 * módulo puro, sem acesso a dados, para Client Components (form do admin)
 * poderem importar os tipos sem puxar código de servidor.
 */

import type { MedalRarity } from "@/lib/profile-showcase"

export type EventCriteriaType = "first_n_signups" | "manual_opt_in" | "aura_redeem"

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
  active: boolean
  startDate: string
  endDate: string | null
}

/** Rótulo curto do critério, usado no admin e na página pública. */
export const EVENT_CRITERIA_LABEL: Record<EventCriteriaType, string> = {
  first_n_signups: "Primeiros N usuários cadastrados no site",
  manual_opt_in: "Resgate manual (usuário clica em Resgatar)",
  aura_redeem: "Resgate com Aura (desconta do saldo do usuário)",
}
