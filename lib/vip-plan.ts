/**
 * Configuração hardcoded do plano de assinatura VIP recorrente via Asaas —
 * mesmo padrão de `lib/market-fees.ts`: números centralizados num módulo
 * puro, sem tabela admin editável (trocar preço = editar aqui + deploy).
 */

export const VIP_SUBSCRIPTION_PRICE_CENTS = 890
export const VIP_SUBSCRIPTION_CYCLE = "MONTHLY" as const

export const VIP_SUBSCRIPTION_BENEFITS = [
  "Selo VIP em destaque no perfil, comentários e posts",
  "Mídia animada (GIF/vídeo) exclusiva no banner e avatar",
  "Até 8 medalhas e 8 favoritos em destaque no perfil",
  "10% de desconto em toda a Central de Aura",
  "Limite diário de reações dobrado (100/dia)",
  "Bônus passivo de Aura: +0,4% sempre, ou +0,25% adicional com ofensiva ativa",
  "Crie sua própria tierlist pessoal de periféricos (Beta)",
] as const

export const VIP_SUPPORT_MESSAGE =
  "Assinando o VIP, você ajuda a manter o site no ar e em constante melhoria."

/** Formata o preço mensal para exibição, ex.: "R$ 8,90". */
export function formatVipPrice(): string {
  return (VIP_SUBSCRIPTION_PRICE_CENTS / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}
