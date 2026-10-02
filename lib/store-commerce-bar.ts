import { isValidBannerLink } from "@/lib/banner-link"

/**
 * Barra comercial da Loja (módulo puro: vitrine, painel e rota usam o mesmo).
 *
 * Fica logo abaixo do menu da Loja, em todas as páginas de /loja. Dois modos:
 * - benefícios: frases curtas com ícone (PIX com desconto, Até 6x sem juros…);
 * - campanha: um aviso só, com link ("Beast X V2 em pré-venda · Ver produto").
 *   Fora do período da campanha a barra volta sozinha aos benefícios.
 */

export const COMMERCE_BENEFIT_ICONS = [
  "pix",
  "card",
  "truck",
  "support",
  "shield",
  "percent",
  "gift",
  "package",
  "zap",
] as const

export type CommerceBenefitIcon = (typeof COMMERCE_BENEFIT_ICONS)[number]

export const COMMERCE_BENEFIT_ICON_LABEL: Record<CommerceBenefitIcon, string> = {
  pix: "PIX",
  card: "Cartão",
  truck: "Frete",
  support: "Suporte",
  shield: "Compra segura",
  percent: "Desconto",
  gift: "Brinde",
  package: "Envio",
  zap: "Rapidez",
}

export const COMMERCE_CAMPAIGN_TONES = ["amber", "emerald", "violet", "rose", "sky"] as const

export type CommerceCampaignTone = (typeof COMMERCE_CAMPAIGN_TONES)[number]

export const COMMERCE_CAMPAIGN_TONE_LABEL: Record<CommerceCampaignTone, string> = {
  amber: "Âmbar",
  emerald: "Verde",
  violet: "Roxo",
  rose: "Rosa",
  sky: "Azul",
}

/** O banco aceita até 6 (CHECK em store_commerce_bar); mais que isso não cabe numa linha. */
export const MAX_COMMERCE_BENEFITS = 6
export const COMMERCE_BENEFIT_TEXT_MAX = 40
export const COMMERCE_CAMPAIGN_TEXT_MAX = 120
export const COMMERCE_CAMPAIGN_LINK_TEXT_MAX = 30

export type StoreCommerceBenefit = {
  icon: CommerceBenefitIcon
  text: string
  link: string | null
}

export type StoreCommerceCampaign = {
  enabled: boolean
  text: string | null
  linkText: string | null
  /** Link digitado pelo admin. Vazio com produto = página do produto (`href`). */
  link: string | null
  productId: string | null
  tone: CommerceCampaignTone
  startsAt: string | null
  endsAt: string | null
  /** Destino final, já resolvido no servidor (link ou página do produto). */
  href: string | null
}

export type StoreCommerceBarConfig = {
  isEnabled: boolean
  benefits: StoreCommerceBenefit[]
  campaign: StoreCommerceCampaign
}

export const DEFAULT_COMMERCE_BENEFITS: StoreCommerceBenefit[] = [
  { icon: "pix", text: "PIX com desconto", link: null },
  { icon: "card", text: "Até 6x sem juros", link: null },
  // O checkout não cobra frete (lib/store-shipping.ts): "calculado no
  // carrinho" contradizia o "Frete grátis" do card e da página do produto.
  { icon: "truck", text: "Frete grátis para todo o Brasil", link: null },
  { icon: "support", text: "Suporte especializado", link: "/suporte" },
]

export const DEFAULT_COMMERCE_BAR: StoreCommerceBarConfig = {
  isEnabled: true,
  benefits: DEFAULT_COMMERCE_BENEFITS,
  campaign: {
    enabled: false,
    text: null,
    linkText: null,
    link: null,
    productId: null,
    tone: "amber",
    startsAt: null,
    endsAt: null,
    href: null,
  },
}

export function isCommerceBenefitIcon(value: unknown): value is CommerceBenefitIcon {
  return typeof value === "string" && (COMMERCE_BENEFIT_ICONS as readonly string[]).includes(value)
}

export function isCommerceCampaignTone(value: unknown): value is CommerceCampaignTone {
  return typeof value === "string" && (COMMERCE_CAMPAIGN_TONES as readonly string[]).includes(value)
}

/**
 * Lê o `benefits` (jsonb) com desconfiança: item com ícone desconhecido, texto
 * vazio ou link inválido some em vez de quebrar a barra da Loja inteira.
 */
export function parseCommerceBenefits(raw: unknown): StoreCommerceBenefit[] {
  if (!Array.isArray(raw)) return []
  const benefits: StoreCommerceBenefit[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const { icon, text, link } = item as Record<string, unknown>
    if (!isCommerceBenefitIcon(icon) || typeof text !== "string" || !text.trim()) continue
    const safeLink = typeof link === "string" && link.trim() && isValidBannerLink(link.trim()) ? link.trim() : null
    benefits.push({ icon, text: text.trim().slice(0, COMMERCE_BENEFIT_TEXT_MAX), link: safeLink })
    if (benefits.length === MAX_COMMERCE_BENEFITS) break
  }
  return benefits
}

/** A campanha está valendo agora? Ligada, com texto e dentro do período. */
export function isCommerceCampaignLive(campaign: StoreCommerceCampaign, nowMs: number): boolean {
  if (!campaign.enabled || !campaign.text?.trim()) return false
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > nowMs) return false
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= nowMs) return false
  return true
}

/**
 * Próximo instante em que a barra muda de modo sozinha (a campanha começa ou
 * termina), para a tela trocar sem precisar recarregar. `null` = nada agendado.
 */
export function nextCommerceBarChange(campaign: StoreCommerceCampaign, nowMs: number): number | null {
  if (!campaign.enabled) return null
  const moments = [campaign.startsAt, campaign.endsAt]
    .map((value) => (value ? new Date(value).getTime() : null))
    .filter((value): value is number => value !== null && value > nowMs)
  return moments.length > 0 ? Math.min(...moments) : null
}
