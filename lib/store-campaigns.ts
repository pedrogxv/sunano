/**
 * Campanhas sazonais da Loja (Black Friday, Natal, Páscoa...). Módulo puro:
 * vale no servidor, no painel e na vitrine.
 *
 * Arte no código, dado no banco (o mesmo modelo das molduras):
 * - `store_campaigns` guarda tema, textos, período e produtos escolhidos
 *   no painel (/admin/store/campanhas).
 * - Este registro diz como cada tema se DESENHA: rótulo, textos padrão e
 *   efeito. As cores moram no CSS, em `[data-campaign-theme="<tema>"]`
 *   (app/globals.css), e TODA peça da campanha (painel, título, contador,
 *   cards, efeito) lê de lá.
 *
 * Tema novo = entrada aqui + bloco de cores no CSS. Sem migration: o banco
 * guarda só o nome, e a API recusa nome que não está nesta lista.
 */

export const STORE_CAMPAIGN_THEMES = ["black_friday", "christmas", "easter"] as const
export type StoreCampaignTheme = (typeof STORE_CAMPAIGN_THEMES)[number]

/** Efeito animado do fundo do cabeçalho. */
export type StoreCampaignEffect = "fireworks" | "snow" | "confetti"

export const STORE_CAMPAIGN_THEME: Record<
  StoreCampaignTheme,
  {
    label: string
    /** Linha pequena acima do título. */
    eyebrow: string
    defaultTitle: string
    defaultSubtitle: string
    effect: StoreCampaignEffect
    effectLabel: string
    /** Amostra de cor do seletor de tema no painel. */
    swatch: string
  }
> = {
  black_friday: {
    label: "Black Friday",
    eyebrow: "Chegou a hora",
    defaultTitle: "Black Friday",
    defaultSubtitle: "As maiores ofertas do ano na Sunano",
    effect: "fireworks",
    effectLabel: "Fogos dourados",
    swatch: "bg-[linear-gradient(135deg,#000_35%,#f5d76e)]",
  },
  christmas: {
    label: "Natal",
    eyebrow: "Boas festas",
    defaultTitle: "Natal Sunano",
    defaultSubtitle: "Presentes para quem joga, com preço de Natal",
    effect: "snow",
    effectLabel: "Neve caindo",
    swatch: "bg-[linear-gradient(135deg,#b91c1c_30%,#f5d76e_60%,#15803d)]",
  },
  easter: {
    label: "Páscoa",
    eyebrow: "Feliz Páscoa",
    defaultTitle: "Páscoa Sunano",
    defaultSubtitle: "Ofertas fresquinhas para a sua mesa",
    effect: "confetti",
    effectLabel: "Confete colorido",
    swatch: "bg-[linear-gradient(135deg,#c4b5fd,#f9a8d4_50%,#fde68a)]",
  },
}

export function isStoreCampaignTheme(value: unknown): value is StoreCampaignTheme {
  return typeof value === "string" && (STORE_CAMPAIGN_THEMES as readonly string[]).includes(value)
}

/** Limites que o banco também confere (CHECK em `store_campaigns`). */
export const STORE_CAMPAIGN_TITLE_MAX = 40
export const STORE_CAMPAIGN_SUBTITLE_MAX = 90
/** Produtos por campanha: o trilho é um carrossel, mas sem fim ele deixa de ser vitrine. */
export const STORE_CAMPAIGN_MAX_PRODUCTS = 24

export type StoreCampaign = {
  id: string
  theme: StoreCampaignTheme
  title: string
  subtitle: string | null
  startsAt: string
  endsAt: string
  isEnabled: boolean
}

export type StoreCampaignStatus = "live" | "scheduled" | "ended" | "disabled"

export function storeCampaignStatus(campaign: Pick<StoreCampaign, "startsAt" | "endsAt" | "isEnabled">, now: number): StoreCampaignStatus {
  if (!campaign.isEnabled) return "disabled"
  if (now < Date.parse(campaign.startsAt)) return "scheduled"
  if (now >= Date.parse(campaign.endsAt)) return "ended"
  return "live"
}

export const STORE_CAMPAIGN_STATUS_LABEL: Record<StoreCampaignStatus, string> = {
  live: "No ar",
  scheduled: "Agendada",
  ended: "Encerrada",
  disabled: "Desligada",
}

/**
 * "01/12 às 23h59", sempre no horário de Brasília: o prazo é o da Loja, não o
 * do relógio de quem visita. Fuso fixo também faz o servidor e o navegador
 * escreverem o mesmo texto (sem divergência na hidratação).
 */
export function formatCampaignDeadline(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value])
  )
  return `${parts.day}/${parts.month} às ${parts.hour}h${parts.minute}`
}

export function splitCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  }
}
