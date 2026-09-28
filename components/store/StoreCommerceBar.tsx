"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BadgePercent,
  CreditCard,
  Gift,
  Headset,
  Package,
  QrCode,
  ShieldCheck,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { isInternalBannerLink } from "@/lib/banner-link"
import {
  isCommerceCampaignLive,
  nextCommerceBarChange,
  type CommerceBenefitIcon,
  type CommerceCampaignTone,
  type StoreCommerceBarConfig,
  type StoreCommerceBenefit,
} from "@/lib/store-commerce-bar"
import { cn } from "@/lib/utils"
import { useStoreCommerceBar } from "@/components/store/StoreCommerceBarContext"

/** Ícone de cada benefício. O painel usa o mesmo mapa no seletor. */
export const COMMERCE_BENEFIT_ICON_COMPONENT: Record<CommerceBenefitIcon, LucideIcon> = {
  pix: QrCode,
  card: CreditCard,
  truck: Truck,
  support: Headset,
  shield: ShieldCheck,
  percent: BadgePercent,
  gift: Gift,
  package: Package,
  zap: Zap,
}

/** Fundo e cor do texto do modo campanha. Gradiente baixo para não disputar com o Hero logo abaixo. */
export const COMMERCE_CAMPAIGN_TONE_CLASS: Record<CommerceCampaignTone, { bar: string; link: string; swatch: string }> = {
  amber: {
    bar: "border-amber-500/25 bg-[linear-gradient(90deg,rgba(245,158,11,0.18),rgba(249,115,22,0.10),rgba(245,158,11,0.18))] text-amber-50",
    link: "text-amber-300",
    swatch: "bg-amber-400",
  },
  emerald: {
    bar: "border-emerald-500/25 bg-[linear-gradient(90deg,rgba(16,185,129,0.18),rgba(20,184,166,0.10),rgba(16,185,129,0.18))] text-emerald-50",
    link: "text-emerald-300",
    swatch: "bg-emerald-400",
  },
  violet: {
    bar: "border-violet-500/25 bg-[linear-gradient(90deg,rgba(139,92,246,0.20),rgba(168,85,247,0.10),rgba(139,92,246,0.20))] text-violet-50",
    link: "text-violet-300",
    swatch: "bg-violet-400",
  },
  rose: {
    bar: "border-rose-500/25 bg-[linear-gradient(90deg,rgba(244,63,94,0.18),rgba(236,72,153,0.10),rgba(244,63,94,0.18))] text-rose-50",
    link: "text-rose-300",
    swatch: "bg-rose-400",
  },
  sky: {
    bar: "border-sky-500/25 bg-[linear-gradient(90deg,rgba(14,165,233,0.18),rgba(59,130,246,0.10),rgba(14,165,233,0.18))] text-sky-50",
    link: "text-sky-300",
    swatch: "bg-sky-400",
  },
}

/** Tempo de cada benefício no celular, onde só cabe um por vez. */
const MOBILE_ROTATE_MS = 3500
/** Teto do setTimeout (≈24,8 dias): além disso o navegador dispara na hora. */
const MAX_TIMEOUT_MS = 2_147_483_647

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  )
}

/** Link interno navega pelo router; URL externa abre em nova aba. */
function BarLink({
  href,
  className,
  children,
  tabIndex,
}: {
  href: string
  className?: string
  children: React.ReactNode
  tabIndex?: number
}) {
  return isInternalBannerLink(href) ? (
    <Link href={href} className={className} tabIndex={tabIndex}>
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
      {children}
    </a>
  )
}

function BenefitContent({ benefit }: { benefit: StoreCommerceBenefit }) {
  const Icon = COMMERCE_BENEFIT_ICON_COMPONENT[benefit.icon]
  return (
    <>
      <Icon className="size-3.5 shrink-0 text-emerald-400" strokeWidth={2.1} />
      <span className="truncate">{benefit.text}</span>
    </>
  )
}

function BenefitItem({ benefit, tabIndex }: { benefit: StoreCommerceBenefit; tabIndex?: number }) {
  const className = "inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-[#c4c4c4]"
  return benefit.link ? (
    <BarLink
      href={benefit.link}
      tabIndex={tabIndex}
      className={cn(className, "transition-colors hover:text-white")}
    >
      <BenefitContent benefit={benefit} />
    </BarLink>
  ) : (
    <span className={className}>
      <BenefitContent benefit={benefit} />
    </span>
  )
}

/** Celular: um benefício por vez, trocando sozinho. Com movimento reduzido, vira uma fileira que rola. */
function MobileBenefits({ benefits }: { benefits: StoreCommerceBenefit[] }) {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const current = index < benefits.length ? index : 0

  useEffect(() => {
    if (reducedMotion || benefits.length < 2) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % benefits.length), MOBILE_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [reducedMotion, benefits.length])

  if (reducedMotion) {
    return (
      <ul className="flex h-9 items-center gap-5 overflow-x-auto px-4 [scrollbar-width:none]">
        {benefits.map((benefit, i) => (
          <li key={`${benefit.icon}-${i}`} className="shrink-0">
            <BenefitItem benefit={benefit} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="relative h-9 overflow-hidden" aria-live="off">
      {benefits.map((benefit, i) => {
        const isCurrent = i === current
        return (
          <li
            key={`${benefit.icon}-${i}`}
            aria-hidden={!isCurrent}
            className={cn(
              "absolute inset-0 flex items-center justify-center px-4 transition-all duration-500 ease-out",
              isCurrent ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            )}
          >
            <BenefitItem benefit={benefit} tabIndex={isCurrent ? 0 : -1} />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Barra comercial em si, sem relógio próprio: o painel usa esta para a
 * pré-visualização, passando o `now` que quiser. A vitrine usa
 * `StoreCommerceBarSlot`, que cuida do horário e da troca de modo.
 */
export function StoreCommerceBar({ config, now }: { config: StoreCommerceBarConfig; now: number }) {
  if (!config.isEnabled) return null

  const { campaign } = config
  if (isCommerceCampaignLive(campaign, now)) {
    const tone = COMMERCE_CAMPAIGN_TONE_CLASS[campaign.tone]
    const linkText = campaign.linkText ?? (campaign.productId ? "Ver produto" : "Saiba mais")
    const content = (
      <>
        <span className="min-w-0 truncate">{campaign.text}</span>
        {campaign.href && (
          <>
            <span aria-hidden className="h-3.5 w-px shrink-0 bg-current opacity-25" />
            <span className={cn("inline-flex shrink-0 items-center gap-1 font-bold underline-offset-4 group-hover:underline", tone.link)}>
              {linkText}
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.4} />
            </span>
          </>
        )}
      </>
    )
    const className = cn(
      "group flex h-9 w-full items-center justify-center gap-2.5 border-b px-4 text-[12.5px] font-semibold",
      tone.bar
    )

    return (
      <aside aria-label="Campanha da Loja">
        {campaign.href ? (
          <BarLink href={campaign.href} className={className}>
            {content}
          </BarLink>
        ) : (
          <div className={className}>{content}</div>
        )}
      </aside>
    )
  }

  if (config.benefits.length === 0) return null

  return (
    <aside aria-label="Benefícios da Loja" className="@container border-b border-[#1f1f1f] bg-[#0c0c0c]">
      <ul className="mx-auto hidden h-9 max-w-7xl items-center justify-center gap-x-6 px-4 @min-[760px]:flex lg:px-8">
        {config.benefits.map((benefit, i) => (
          <li key={`${benefit.icon}-${i}`} className="flex min-w-0 items-center gap-x-6">
            {i > 0 && <span aria-hidden className="size-[3px] shrink-0 rounded-full bg-[#3a3a3a]" />}
            <BenefitItem benefit={benefit} />
          </li>
        ))}
      </ul>
      <div className="@min-[760px]:hidden">
        <MobileBenefits benefits={config.benefits} />
      </div>
    </aside>
  )
}

/**
 * Barra comercial das páginas da Loja: lê a configuração do layout de /loja e
 * troca sozinha de modo quando a campanha começa ou termina, sem recarregar.
 * A primeira pintura usa o relógio do servidor para casar com a hidratação.
 */
export function StoreCommerceBarSlot() {
  const context = useStoreCommerceBar()
  const [now, setNow] = useState(context?.serverNow ?? 0)
  const synced = useRef(false)
  const config = context?.config ?? null

  useEffect(() => {
    if (!config) return
    const timers: number[] = []
    const current = Date.now()

    // Página em cache pode ter sido gerada minutos atrás: acerta pelo relógio
    // do visitante logo depois de hidratar.
    if (!synced.current) {
      synced.current = true
      timers.push(window.setTimeout(() => setNow(Date.now()), 0))
    }

    const next = nextCommerceBarChange(config.campaign, current)
    if (next !== null) {
      timers.push(window.setTimeout(() => setNow(Date.now()), Math.min(next - current + 50, MAX_TIMEOUT_MS)))
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [config, now])

  if (!config) return null
  return <StoreCommerceBar config={config} now={now} />
}
