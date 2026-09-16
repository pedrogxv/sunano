/**
 * Catálogo dos planos de assinatura VIP recorrente via Asaas.
 *
 * Módulo puro, hardcoded, sem tabela admin editável (trocar preço = editar
 * aqui + deploy) — e é exatamente por ser hardcoded que ele pode servir de
 * FONTE DE VERDADE de segurança: nada que venha do cliente, do corpo da
 * requisição ou do webhook define preço ou duração. O usuário escolhe uma
 * CHAVE de plano (`monthly` | `yearly`); todo o resto — quanto custa, quantos
 * meses concede, qual ciclo vai para a Asaas — é resolvido aqui no servidor.
 *
 * POR QUE O PLANO É GRAVADO NA LINHA DA ASSINATURA
 * ------------------------------------------------
 * A duração do acesso (`+ interval`) é aplicada pelas RPCs quando o webhook
 * confirma um pagamento. Se o período viesse no payload do webhook, quem
 * conseguisse adulterar a cobrança no painel da Asaas (ou reenviar um evento
 * costurado) pediria "anual" pagando o preço mensal. Por isso
 * `vip_subscriptions.billing_period` é escrito no INSTANTE da criação, a
 * partir deste catálogo, e as RPCs leem o intervalo DA LINHA — o webhook só
 * diz "este pagamento foi confirmado", nunca "conceda 12 meses".
 */

import {
  VIP_FOUNDER_DEADLINE_LABEL,
  isVipFounderWindowOpen,
} from "@/lib/profile-frames"

export type VipBillingPeriod = "monthly" | "yearly"

export type VipPlan = {
  period: VipBillingPeriod
  priceCents: number
  /** Ciclo aceito pela API da Asaas (`cycle` de /v3/subscriptions). */
  asaasCycle: "MONTHLY" | "YEARLY"
  /** Meses de acesso concedidos por cobrança confirmada — espelha o `interval` das RPCs. */
  months: number
  /** Rótulo curto do período, para colar depois do preço ("/mês", "/ano"). */
  unitLabel: string
  /** Nome do plano na interface. */
  label: string
}

export const VIP_PLANS: Record<VipBillingPeriod, VipPlan> = {
  monthly: {
    period: "monthly",
    priceCents: 890,
    asaasCycle: "MONTHLY",
    months: 1,
    unitLabel: "/mês",
    label: "Mensal",
  },
  yearly: {
    period: "yearly",
    priceCents: 8990,
    asaasCycle: "YEARLY",
    months: 12,
    unitLabel: "/ano",
    label: "Anual",
  },
}

export const VIP_DEFAULT_BILLING_PERIOD: VipBillingPeriod = "monthly"

/**
 * Converte um valor QUALQUER (corpo de requisição, query string, coluna
 * antiga do banco) na chave de plano correspondente, caindo no mensal quando
 * não reconhece. É o único ponto de entrada permitido para dado externo: o
 * resto do código trabalha com `VipBillingPeriod`, nunca com a string crua.
 *
 * O fallback é o MENSAL de propósito — o plano mais curto e mais barato. Um
 * valor lixo nunca pode virar 12 meses de acesso por acidente.
 */
export function parseVipBillingPeriod(value: unknown): VipBillingPeriod {
  return value === "yearly" ? "yearly" : VIP_DEFAULT_BILLING_PERIOD
}

/** Plano a partir da chave, sempre com fallback seguro (mensal). */
export function getVipPlan(period: unknown): VipPlan {
  return VIP_PLANS[parseVipBillingPeriod(period)]
}

/** Preço do plano em centavos. */
export function vipPlanPriceCents(period: unknown): number {
  return getVipPlan(period).priceCents
}

const VIP_PERMANENT_BENEFITS = [
  "Crie sua própria tierlist pessoal de periféricos",
  "Selo VIP em destaque no perfil, comentários e posts",
  "Mídia animada (GIF/vídeo) exclusiva no banner e avatar",
  "Até 8 medalhas e 8 favoritos em destaque no perfil",
  "Favorite até 8 softwares e escolha a ordem de exibição",
  "10% de desconto em tudo que custa Aura (molduras, troca de nome, Proteção de Ofensiva e medalhas de evento)",
  "Limite diário de reações dobrado (100/dia)",
  "Bônus passivo de Aura: +0,4% sempre, ou +0,25% adicional com ofensiva ativa",
] as const

/**
 * Benefícios do VIP, incluindo os por tempo limitado que ainda valem AGORA.
 *
 * É função, e não constante, por causa da Moldura de Fundador: ela só é
 * concedida a quem assina dentro da janela (ver `VIP_FOUNDER_DEADLINE` em
 * `lib/profile-frames.ts`). Numa lista fixa, ela continuaria prometida nas
 * telas de assinatura depois de fechada a janela — o site cobraria por um
 * benefício que o banco recusa conceder, que é a pior forma de errar isso.
 *
 * A janela entra no TOPO enquanto está aberta: é o argumento mais forte e o
 * único com prazo.
 */
export function vipSubscriptionBenefits(now: Date = new Date()): string[] {
  if (!isVipFounderWindowOpen(now)) return [...VIP_PERMANENT_BENEFITS]

  return [
    `Moldura de Fundador exclusiva, só para quem assinar até ${VIP_FOUNDER_DEADLINE_LABEL} — depois disso não é mais concedida, e fica com você para sempre`,
    ...VIP_PERMANENT_BENEFITS,
  ]
}

export const VIP_SUPPORT_MESSAGE =
  "Assinando o VIP, além dos benefícios, você ajuda a manter e melhorar o site."

/** Formata centavos em BRL, ex.: "R$ 8,90". */
export function formatBrlCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Preço do plano formatado, ex.: "R$ 8,90" / "R$ 89,90". */
export function formatVipPrice(period: unknown = VIP_DEFAULT_BILLING_PERIOD): string {
  return formatBrlCents(getVipPlan(period).priceCents)
}

/**
 * Quanto o anual custa por mês, para a interface justificar a escolha
 * ("equivale a R$ 7,49/mês"). Arredonda para cima ao centavo: prometer menos
 * do que o usuário vai pagar em 12 parcelas seria propaganda enganosa, ainda
 * que por um centavo.
 */
export function vipYearlyMonthlyEquivalentCents(): number {
  return Math.ceil(VIP_PLANS.yearly.priceCents / VIP_PLANS.yearly.months)
}

/**
 * Economia percentual do anual contra 12 mensais — número exibido no selo
 * "economize X%". Derivado do catálogo, nunca digitado à mão: um reajuste de
 * preço que tornasse o anual pior automaticamente zera o selo em vez de
 * mentir na tela.
 */
export function vipYearlySavingsPercent(): number {
  const twelveMonths = VIP_PLANS.monthly.priceCents * VIP_PLANS.yearly.months
  if (twelveMonths <= VIP_PLANS.yearly.priceCents) return 0
  return Math.round(((twelveMonths - VIP_PLANS.yearly.priceCents) / twelveMonths) * 100)
}

/** Economia em centavos do anual contra 12 mensais (0 se não houver). */
export function vipYearlySavingsCents(): number {
  const twelveMonths = VIP_PLANS.monthly.priceCents * VIP_PLANS.yearly.months
  return Math.max(0, twelveMonths - VIP_PLANS.yearly.priceCents)
}
