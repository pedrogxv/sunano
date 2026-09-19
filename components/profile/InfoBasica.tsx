import { Activity, Crown, Sparkles } from "lucide-react"
import { AuraIcon } from "@/components/ui/AuraIcon"

import { getTierCapabilities, isVipActive, type AccountTier } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
import { cn } from "@/lib/utils"
import { StreakBadge } from "./StreakBadge"
import { EditNameButton } from "./EditNameButton"
import { TrustSealButton } from "@/components/ui/TrustSealButton"
import type { TrustLevel, TrustStatus } from "@/lib/trust-factor"

interface InfoBasicaProps {
  name: string
  tier: AccountTier
  vipExpiresAt?: string | null
  memberSince?: string | null
  /** Slug do perfil — resolve tag especial (ex: SUNANO), se houver. */
  displaySlug?: string | null
  /** Posição no ranking de Aura. Só existe (não-null) dentro do Top 100. */
  auraRank?: number | null
  /** Posição no ranking de atividade (posts + comentários). Idem, Top 100. */
  activityRank?: number | null
  /**
   * Faixa pública do Trust Factor. Só a FAIXA aparece — nunca a pontuação
   * (ver `components/ui/TrustSealButton`). `undefined` esconde o selo, para
   * chamadas antigas que ainda não passam o dado.
   */
  trustLevel?: TrustLevel
  trustStatus?: TrustStatus
  /** Dias de ofensiva atual — some da badge quando zerada (ver `StreakBadge`). */
  streak?: number
  /** Ofensiva sustentada hoje por uma "Proteção de Ofensiva" (escudo). */
  streakFrozen?: boolean
  /** Último dia coberto pelo escudo (YYYY-MM-DD), para o tooltip da badge. */
  streakFrozenUntil?: string | null
  bio?: string | null
  /** Habilita o ícone de trocar nome (Central de Aura) quando é o próprio dono. */
  isOwner?: boolean
}

const TIER_BADGE_STYLES: Record<AccountTier, string> = {
  common: "border-border bg-muted/40 text-muted-foreground",
  vip: "border-[var(--vip-accent-soft)] bg-[var(--vip-accent)]/10 text-[var(--vip-accent)]",
}

/**
 * Nome, badges (tier + tag especial + ranking) e data de entrada — o bloco
 * centralizado abaixo da foto no header do perfil público.
 *
 * Nome numa linha e badges na linha de baixo, cada bloco no seu próprio eixo
 * central: colados na mesma linha, um nome curto ("end") deixava as badges
 * grudadas nele em vez de formarem uma segunda fileira equilibrada.
 *
 * O selo do Trust Factor acompanha o NOME, não a fileira de pílulas: ele é o
 * único sinal que fala de COMPORTAMENTO (os outros são participação), e
 * misturado às badges virava só mais um contador.
 *
 * A bio entra por último, dentro do mesmo bloco centralizado — sem card
 * próprio, para não duplicar a moldura que já envolve nome e badges.
 */
export function InfoBasica({
  name,
  tier,
  vipExpiresAt = null,
  memberSince,
  displaySlug,
  auraRank,
  activityRank,
  trustLevel,
  trustStatus = "active",
  streak = 0,
  streakFrozen = false,
  streakFrozenUntil = null,
  bio,
  isOwner = false,
}: InfoBasicaProps) {
  const { label } = getTierCapabilities(tier)
  const isVip = isVipActive(tier, vipExpiresAt)
  const specialTag = getSpecialTag(displaySlug)

  const joinedLabel = memberSince
    ? new Date(memberSince).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : null

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Trust Factor ao lado do NOME, não na fileira de badges: ele é o
          único sinal que fala de COMPORTAMENTO (os outros medem
          participação), e no meio das pílulas virava mais um contador. O
          desenho é o do explicativo (disco com anel), na escala do
          `EditNameButton` — grande o bastante para se ler, pequeno o bastante
          para não competir com o nome nem com a foto. Só o ícone: quem nomeia
          a faixa é o balão, e a ida para o FAQ é uma ação explícita lá dentro
          (clicar por curiosidade não tira ninguém do perfil). */}
      <div className="flex items-center gap-1.5">
        {trustLevel && (
          <TrustSealButton level={trustLevel} status={trustStatus} size="xs" />
        )}
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{name}</h1>
        {isOwner && <EditNameButton currentName={name} />}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
            TIER_BADGE_STYLES[isVip ? "vip" : "common"]
          )}
        >
          {isVip && <Crown className="size-3 vip-badge-crown" />}
          <span className={cn(isVip && "vip-badge-text")}>{isVip ? label : getTierCapabilities("common").label}</span>
        </span>

        {specialTag && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
              specialTag.className
            )}
          >
            <Sparkles className="size-3" />
            {specialTag.label}
          </span>
        )}

        {/* Só aparece dentro do Top 100 — fora dele a posição não diz muita
            coisa e a badge vira ruído. */}
        {auraRank != null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[11px] font-semibold text-orange-400">
            <AuraIcon size="sm" tone="inherit" />#{auraRank}
          </span>
        )}

        {activityRank != null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            <Activity className="size-3" strokeWidth={2} />#{activityRank}
          </span>
        )}

        <StreakBadge
          days={streak}
          size="sm"
          showInactive
          frozen={streakFrozen}
          frozenUntil={streakFrozenUntil}
          className="px-2 py-0.5 text-[11px]"
        />
      </div>

      {joinedLabel && (
        <p className="text-xs text-muted-foreground/60">Membro desde {joinedLabel}</p>
      )}

      {bio && <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{bio}</p>}
    </div>
  )
}
