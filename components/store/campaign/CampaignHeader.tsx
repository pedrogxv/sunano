"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { CandyCane, Egg, Flower2, Gift, PartyPopper, Rabbit, Snowflake, Sparkles, TreePine, type LucideIcon } from "lucide-react"

import { CampaignEffect } from "@/components/store/campaign/CampaignEffect"
import { cn } from "@/lib/utils"
import {
  formatCampaignDeadline,
  splitCountdown,
  STORE_CAMPAIGN_THEME,
  type StoreCampaignTheme,
} from "@/lib/store-campaigns"

/** Ícones de cada tema: dois ao lado da linha de cima e um depois do título. */
const THEME_ICONS: Record<StoreCampaignTheme, { eyebrow: [LucideIcon, LucideIcon]; title: LucideIcon }> = {
  black_friday: { eyebrow: [PartyPopper, Sparkles], title: Gift },
  christmas: { eyebrow: [Snowflake, CandyCane], title: TreePine },
  easter: { eyebrow: [Flower2, Egg], title: Rabbit },
}

/** Relógio de 1s compartilhado. No servidor não há "agora" confiável: o contador nasce com traços. */
function subscribeSecond(onTick: () => void) {
  const id = window.setInterval(onTick, 1000)
  return () => window.clearInterval(id)
}
const currentSecond = () => Math.floor(Date.now() / 1000)
const noSecond = () => null

function TimeTile({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="cmp-tile flex min-w-[48px] flex-col items-center rounded-[10px] border px-2 py-1.5 backdrop-blur-sm sm:min-w-[58px] sm:py-2">
      <span className="campaign-text font-display text-[20px] font-bold leading-none tabular-nums sm:text-[26px]">
        {value == null ? "--" : String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--cmp-muted)] sm:text-[9px]">
        {label}
      </span>
    </div>
  )
}

function Colon() {
  return <span className="font-display text-lg font-bold text-[var(--cmp-label)] opacity-60">:</span>
}

/**
 * Cabeçalho de uma campanha da Loja: painel com a borda do tema, efeito
 * animado ao fundo, título grande e contador até o fim. Serve a vitrine e a
 * prévia do painel. As cores vêm do `data-campaign-theme` de um ancestral
 * (a seção da campanha, ou a prévia), nunca de classe de cor solta aqui.
 *
 * Quando o contador zera, `onExpire` tira a campanha da tela sem recarregar.
 */
export function CampaignHeader({
  theme,
  title,
  subtitle,
  endsAt,
  actions,
  onExpire,
  className,
}: {
  theme: StoreCampaignTheme
  title: string
  subtitle: string | null
  endsAt: string
  actions?: ReactNode
  onExpire?: () => void
  className?: string
}) {
  const config = STORE_CAMPAIGN_THEME[theme]
  const icons = THEME_ICONS[theme]
  const [EyebrowLeft, EyebrowRight] = icons.eyebrow
  const TitleIcon = icons.title
  const deadline = formatCampaignDeadline(endsAt)

  const second = useSyncExternalStore(subscribeSecond, currentSecond, noSecond)
  const remaining = second == null ? null : Math.max(0, Date.parse(endsAt) - second * 1000)
  const parts = remaining == null ? null : splitCountdown(remaining)

  useEffect(() => {
    if (remaining === 0) onExpire?.()
  }, [remaining, onExpire])

  return (
    <div className={cn("campaign-panel rounded-[22px] p-[1.5px]", className)}>
      <div className="campaign-panel-inner relative overflow-hidden rounded-[20.5px]">
        <CampaignEffect effect={config.effect} />

        <div className="relative z-10 flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-8 sm:py-7">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--cmp-label)] sm:text-[11px]">
              <EyebrowLeft className="campaign-wiggle size-3.5 sm:size-4" strokeWidth={2.4} />
              {config.eyebrow}
              <EyebrowRight className="campaign-wiggle size-3 [animation-delay:0.6s] sm:size-3.5" strokeWidth={2.4} />
            </p>
            <h2 className="flex items-center gap-2.5 font-display text-[34px] font-black uppercase leading-[0.95] tracking-tight sm:text-[54px]">
              <span className="campaign-text campaign-shimmer min-w-0 break-words">{title}</span>
              <TitleIcon className="campaign-wiggle size-7 shrink-0 text-[var(--cmp-label)] [animation-delay:1.2s] sm:size-10" strokeWidth={2} />
            </h2>
            {subtitle && <p className="mt-1 text-[13.5px] font-bold text-white sm:text-[16px]">{subtitle}</p>}
            <p className="text-[12px] font-medium text-[#a3a3a3] sm:text-[13px]">
              Promoções e valores válidos até{" "}
              <span className="whitespace-nowrap font-bold text-[var(--cmp-label)]">{deadline}</span>
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:items-end">
            <div className="flex flex-col gap-1.5 sm:items-end">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[var(--cmp-muted)]">Termina em</p>
              <div className="flex items-center gap-1.5 sm:gap-2" role="timer" aria-label={`Ofertas válidas até ${deadline}`}>
                <TimeTile value={parts?.days ?? null} label="dias" />
                <Colon />
                <TimeTile value={parts?.hours ?? null} label="horas" />
                <Colon />
                <TimeTile value={parts?.minutes ?? null} label="min" />
                <Colon />
                <TimeTile value={parts?.seconds ?? null} label="seg" />
              </div>
            </div>
            {actions && <div className="flex justify-end">{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
