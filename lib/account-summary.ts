import type { TrustLevel, TrustStatus } from "@/lib/trust-factor"
import { TRUST_MATURITY_CAPS, trustLevelOf } from "@/lib/trust-factor"

/**
 * Retrato da conta do PRÓPRIO usuário — o hero de `/conta` e `/perfil` e a
 * "Sua jornada" logo abaixo dele.
 *
 * Módulo puro (tipos + contas de data), para o Client Component importar sem
 * puxar `lib/server/**`. Quem monta é `getAccountSummary`
 * (`account-summary-repository.ts`), servido por `GET /api/account/summary`.
 *
 * O Trust viaja SÓ como faixa e estado, nunca a nota: a resposta da rota vai
 * para o navegador, e o número exato é o gradiente que um farmador precisa
 * (mesma régua de `PublicTrustSummary`).
 */
export type AccountSummary = {
  memberSince: string
  /** Ordem de cadastro na Sunano (1 = primeira conta). `null` se a contagem falhou. */
  memberNumber: number | null
  trust: {
    level: TrustLevel
    status: TrustStatus
    canRedeemPhysical: boolean
  }
  aura: {
    balance: number
    totalEarned: number
    /** Posição no ranking geral, só no Top 100. */
    rank: number | null
  }
  streak: {
    current: number
    longest: number
    frozen: boolean
    frozenUntil: string | null
  }
  medals: number
  followers: number
  profileViews: number
  contributions: {
    posts: number
    comments: number
    reviews: number
  }
  isFounder: boolean
  /** Primeiras vezes, já em ordem cronológica. Só entra o que aconteceu. */
  milestones: AccountMilestone[]
}

export type AccountMilestoneKind =
  | "joined"
  | "first_post"
  | "first_comment"
  | "first_review"
  | "first_medal"

export type AccountMilestone = {
  kind: AccountMilestoneKind
  at: string
  /** Complemento curto: título do post, nome da medalha. */
  detail: string | null
  href: string | null
}

const DAY_MS = 86_400_000

/** Dias corridos desde o cadastro (o dia do cadastro é o dia 1). */
export function daysOnSunano(memberSince: string, now: number = Date.now()): number {
  const created = new Date(memberSince).getTime()
  if (Number.isNaN(created)) return 1
  return Math.max(1, Math.floor((now - created) / DAY_MS) + 1)
}

export type TrustMaturity = {
  /** Faixa mais alta que o tempo de casa permite hoje. */
  ceiling: TrustLevel
  /** Próximo degrau do teto, ou `null` quando a conta já é madura (sem teto). */
  next: { atDay: number; ceiling: TrustLevel; daysLeft: number } | null
  /** 0–1 até a maturidade completa (dia 90). */
  progress: number
}

/**
 * Teto de maturidade do Trust traduzido em FAIXA — o que a pessoa pode ler
 * sem ver a nota. Sai de `TRUST_MATURITY_CAPS` (espelho de
 * `trust_maturity_cap()` no banco), então muda sozinho se a régua mudar.
 *
 * Não vaza nada que o FAQ do Trust já não diga: o teto depende só da idade da
 * conta, e a idade a própria pessoa sabe.
 */
export function trustMaturityOf(memberSince: string, now: number = Date.now()): TrustMaturity {
  const created = new Date(memberSince).getTime()
  const ageDays = Number.isNaN(created) ? 0 : (now - created) / DAY_MS
  const steps = TRUST_MATURITY_CAPS
  const currentIndex = steps.reduce((acc, step, i) => (ageDays >= step.afterDays ? i : acc), 0)
  const current = steps[currentIndex]
  const nextStep = steps[currentIndex + 1] ?? null
  const matureAt = steps[steps.length - 1].afterDays

  return {
    ceiling: trustLevelOf(current.cap),
    next: nextStep
      ? {
          atDay: nextStep.afterDays,
          ceiling: trustLevelOf(nextStep.cap),
          daysLeft: Math.max(1, Math.ceil(nextStep.afterDays - ageDays)),
        }
      : null,
    progress: Math.min(1, Math.max(0, ageDays / matureAt)),
  }
}
