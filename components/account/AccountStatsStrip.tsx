"use client"

import type { ReactNode } from "react"
import { Award, Bird, MessagesSquare, Snowflake, Users } from "lucide-react"

import { RouteLink } from "@/components/ui/route-link"
import { AuraAmount } from "@/components/ui/AuraIcon"
import { Skeleton } from "@/components/ui/skeleton"
import { trustMaturityOf, type AccountSummary } from "@/lib/account-summary"
import { streakHeatTier, STREAK_HEAT_STYLES } from "@/lib/streak-multiplier"
import { TRUST_LEVEL_STYLE, TRUST_STATUS_LABEL, trustLevelLabel } from "@/lib/trust-factor"
import { cn } from "@/lib/utils"

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`

/**
 * Faixa de números do hero da conta — o "painel do carro" de quem você é na
 * Sunano, num relance: Aura, Ofensiva, Trust, medalhas, comunidade e o que
 * você já escreveu.
 *
 * Cada tile reaproveita o átomo do sistema dele (`AuraAmount`, os tokens de
 * `TRUST_LEVEL_STYLE` e de calor da Ofensiva) em vez de redesenhar: a chama
 * aqui é a mesma da topbar. O SELO do Trust não entra no tile — ele
 * acompanha o nome, no hero (regra do `TrustSealButton`); aqui vai a faixa
 * por extenso e quanto o tempo de casa ainda segura dela.
 *
 * Separação por fundo e espaço, sem borda interna entre tiles.
 */
export function AccountStatsStrip({
  summary,
  loading,
  publicProfileHref,
}: {
  summary: AccountSummary | null
  loading: boolean
  publicProfileHref: string | null
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl bg-muted/30" />
        ))}
      </div>
    )
  }
  if (!summary) return null

  const { aura, streak, trust, contributions } = summary
  const heat = STREAK_HEAT_STYLES[streakHeatTier(streak.current)]
  const streakActive = streak.current > 0
  const restricted = trust.status === "restricted" || trust.status === "blocked"
  const maturity = trustMaturityOf(summary.memberSince)
  const totalContributions = contributions.posts + contributions.comments + contributions.reviews

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile
        label="Aura"
        href="/aura"
        value={<AuraAmount value={aura.balance} size="lg" tone="brand" />}
        hint={
          aura.rank ? (
            <span className="font-semibold text-foreground/80">#{aura.rank} no ranking</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <AuraAmount value={aura.totalEarned} size="xs" tone="muted" /> na história
            </span>
          )
        }
      />

      <StatTile
        label="Ofensiva"
        href="/aura"
        value={
          <span className={cn("inline-flex items-center gap-1.5", streak.frozen ? "text-sky-300" : heat.text)}>
            {streak.frozen ? (
              <Snowflake className="size-5" />
            ) : (
              <Bird className={cn("size-5", streakActive && heat.glow)} />
            )}
            <span className={cn(!streakActive && "text-muted-foreground")}>
              {streakActive ? streak.current : "0"}
            </span>
          </span>
        }
        hint={
          streak.frozen
            ? "Protegida por escudo"
            : streak.longest > 0
              ? `Recorde: ${plural(streak.longest, "dia", "dias")}`
              : "Complete as missões"
        }
      />

      <StatTile
        label="Trust Factor"
        href="/informacoes/trust-factor"
        value={
          <span
            className={cn(
              "text-lg",
              restricted ? "text-muted-foreground" : TRUST_LEVEL_STYLE[trust.level].text
            )}
          >
            {restricted ? TRUST_STATUS_LABEL[trust.status] : trustLevelLabel(trust.level)}
          </span>
        }
        hint={
          restricted ? (
            "Conta em análise"
          ) : maturity.next ? (
            <span className="flex flex-col gap-1">
              <span>
                {trustLevelLabel(maturity.next.ceiling)} libera em {plural(maturity.next.daysLeft, "dia", "dias")}
              </span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-muted/50" aria-hidden>
                <span
                  className={cn("block h-full rounded-full bg-current", TRUST_LEVEL_STYLE[maturity.next.ceiling].text)}
                  style={{ width: `${Math.round(maturity.progress * 100)}%` }}
                />
              </span>
            </span>
          ) : trust.canRedeemPhysical ? (
            "Prêmio físico liberado"
          ) : (
            "Conta madura"
          )
        }
      />

      <StatTile
        label="Medalhas"
        href="/conquistas"
        value={
          <span className="inline-flex items-center gap-1.5">
            <Award className="size-5 text-muted-foreground" />
            {summary.medals.toLocaleString("pt-BR")}
          </span>
        }
        hint="Ver coleção"
      />

      <StatTile
        label="Comunidade"
        href={publicProfileHref}
        value={
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-5 text-muted-foreground" />
            {summary.followers.toLocaleString("pt-BR")}
          </span>
        }
        hint={`${summary.followers === 1 ? "seguidor" : "seguidores"} · ${plural(summary.profileViews, "visita", "visitas")}`}
      />

      <StatTile
        label="Contribuições"
        href={publicProfileHref}
        value={
          <span className="inline-flex items-center gap-1.5">
            <MessagesSquare className="size-5 text-muted-foreground" />
            {totalContributions.toLocaleString("pt-BR")}
          </span>
        }
        hint={`${contributions.posts} posts · ${contributions.comments} coment. · ${contributions.reviews} reviews`}
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string
  value: ReactNode
  hint: ReactNode
  href?: string | null
}) {
  const body = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tabular-nums leading-none text-foreground">{value}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </>
  )
  const className =
    "flex min-w-0 flex-col gap-2 rounded-xl bg-background/50 px-3 py-3 backdrop-blur-sm transition-colors"

  if (!href) return <div className={className}>{body}</div>
  return (
    <RouteLink href={href} className={cn(className, "hover:bg-muted/50")}>
      {body}
    </RouteLink>
  )
}
