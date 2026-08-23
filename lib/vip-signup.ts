// Fonte única da flag que liga/desliga a assinatura VIP paga (cartão via
// Asaas). Ativação de VIP resgatando Aura não depende disso — não envolve
// cobrança real, então continua disponível mesmo com a flag desligada.
// Mesmo padrão de `lib/store-maintenance.ts`.

export function isVipSubscriptionEnabled() {
  const value = process.env.VIP_SUBSCRIPTION_ENABLED ?? process.env.NEXT_PUBLIC_VIP_SUBSCRIPTION_ENABLED
  // Sem cobrança possível no site por enquanto — desligado por padrão até
  // termos um jeito de cobrar o usuário de novo.
  return value === "true"
}
