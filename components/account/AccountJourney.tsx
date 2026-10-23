"use client"

import type { ComponentType } from "react"
import { Award, Bird, Flag, MessageCircle, MessageSquarePlus, ShieldCheck, Star } from "lucide-react"

import { RouteLink } from "@/components/ui/route-link"
import {
  daysOnSunano,
  trustMaturityOf,
  type AccountMilestoneKind,
  type AccountSummary,
} from "@/lib/account-summary"
import { FRAME_STREAK_MILESTONES } from "@/lib/profile-frames"
import { trustLevelLabel } from "@/lib/trust-factor"
import { cn } from "@/lib/utils"

type Stop = {
  key: string
  Icon: ComponentType<{ className?: string }>
  title: string
  detail: string | null
  /** Data já formatada (passado) ou prazo ("em 48 dias") para o que falta. */
  when: string
  href: string | null
  upcoming: boolean
}

const MILESTONE_COPY: Record<AccountMilestoneKind, { title: string; Icon: Stop["Icon"] }> = {
  joined: { title: "Chegou na Sunano", Icon: Flag },
  first_post: { title: "Primeiro post", Icon: MessageSquarePlus },
  first_comment: { title: "Primeiro comentário", Icon: MessageCircle },
  first_review: { title: "Primeira review", Icon: Star },
  first_medal: { title: "Primeira medalha", Icon: Award },
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })

const inDays = (n: number) => (n <= 1 ? "amanhã" : `em ${n} dias`)

/**
 * "Sua jornada" — a linha do tempo da conta: as primeiras vezes que já
 * aconteceram e, tracejados no fim, os próximos marcos ao alcance.
 *
 * Os próximos marcos saem das MESMAS réguas que o resto do site usa —
 * `TRUST_MATURITY_CAPS` (via `trustMaturityOf`) e `FRAME_STREAK_MILESTONES` —
 * para a promessa daqui nunca divergir do que o banco concede.
 */
export function AccountJourney({ summary }: { summary: AccountSummary }) {
  const past: Stop[] = summary.milestones.map((m) => ({
    key: m.kind,
    Icon: MILESTONE_COPY[m.kind].Icon,
    title: MILESTONE_COPY[m.kind].title,
    detail:
      m.kind === "joined" && summary.memberNumber
        ? `Membro nº ${summary.memberNumber.toLocaleString("pt-BR")}`
        : m.detail,
    when: formatDate(m.at),
    href: m.href,
    upcoming: false,
  }))

  const upcoming: Stop[] = []
  const has = (kind: AccountMilestoneKind) => summary.milestones.some((m) => m.kind === kind)

  const maturity = trustMaturityOf(summary.memberSince)
  if (maturity.next) {
    upcoming.push({
      key: "trust-maturity",
      Icon: ShieldCheck,
      title: `Trust até ${trustLevelLabel(maturity.next.ceiling)}`,
      detail: `Teto de confiança sobe no dia ${maturity.next.atDay}`,
      when: inDays(maturity.next.daysLeft),
      href: "/informacoes/trust-factor",
      upcoming: true,
    })
  }

  // Próxima moldura de Ofensiva ainda não conquistada. O direito sai do
  // recorde, mas para alcançá-la a sequência VIVA precisa chegar lá.
  const nextStreakFrame = FRAME_STREAK_MILESTONES.find((m) => m > summary.streak.longest)
  if (nextStreakFrame) {
    const left = nextStreakFrame - summary.streak.current
    upcoming.push({
      key: "streak-frame",
      Icon: Bird,
      title: `Moldura de ${nextStreakFrame} ${nextStreakFrame === 1 ? "dia" : "dias"}`,
      detail: "Marco de Ofensiva",
      when: summary.streak.current > 0 ? inDays(left) : nextStreakFrame === 1 ? "complete as missões hoje" : `${nextStreakFrame} dias seguidos`,
      href: "/aura",
      upcoming: true,
    })
  }

  if (!has("first_post")) {
    upcoming.push({
      key: "goal-post",
      Icon: MessageSquarePlus,
      title: "Primeiro post",
      detail: "Abra um tópico no fórum",
      when: "quando quiser",
      href: "/forum",
      upcoming: true,
    })
  } else if (!has("first_review")) {
    upcoming.push({
      key: "goal-review",
      Icon: Star,
      title: "Primeira review",
      detail: "Avalie um periférico que você usa",
      when: "quando quiser",
      href: "/perifericos",
      upcoming: true,
    })
  }

  const stops = [...past, ...upcoming.slice(0, 3)]
  const days = daysOnSunano(summary.memberSince)

  return (
    <section aria-labelledby="account-journey-title" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="account-journey-title" className="text-sm font-semibold text-foreground">
          Sua jornada
        </h2>
        <span className="text-xs text-muted-foreground">
          {days === 1 ? "Primeiro dia por aqui" : `${days.toLocaleString("pt-BR")} dias na Sunano`}
        </span>
      </div>

      {/* Trilho VERTICAL no celular/tablet (os cinco marcos não cabem lado a
          lado sem rolagem, e rolagem lateral escondia o fim da jornada) e
          HORIZONTAL a partir de `lg`. A linha passa por trás dos pontos;
          tracejada no trecho do que ainda falta. */}
      <ol className="flex flex-col lg:flex-row lg:gap-3">
        {stops.map((stop, i) => {
          const next = stops[i + 1]
          const card = (
            <>
              <span
                className={cn(
                  "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                  stop.upcoming
                    ? "border border-dashed border-muted-foreground/40 bg-background text-muted-foreground"
                    : "bg-foreground text-background"
                )}
              >
                <stop.Icon className="size-4" />
              </span>
              <div className="min-w-0 pt-1 lg:mt-3 lg:pt-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {stop.when}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm font-semibold",
                    stop.upcoming ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {stop.title}
                </p>
                {stop.detail && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{stop.detail}</p>
                )}
              </div>
            </>
          )
          const layout = "flex gap-3 lg:flex-col lg:gap-0"

          return (
            <li key={stop.key} className="relative pb-5 last:pb-0 lg:min-w-0 lg:flex-1 lg:pb-0">
              {next && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-4 top-8 bottom-0 w-px lg:left-8 lg:right-[-12px] lg:top-4 lg:bottom-auto lg:h-px lg:w-auto",
                    next.upcoming
                      ? "border-l border-dashed border-muted-foreground/30 lg:border-l-0 lg:border-t"
                      : "bg-foreground/40"
                  )}
                />
              )}
              {stop.href ? (
                <RouteLink
                  href={stop.href}
                  className={cn(
                    layout,
                    "rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/60"
                  )}
                >
                  {card}
                </RouteLink>
              ) : (
                <div className={layout}>{card}</div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
