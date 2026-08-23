/**
 * Bônus percentual de Aura da Ofensiva e a cor que a representa. Espelha
 * `streak_aura_multiplier_bps` (20260828_streak_aura_multiplier.sql) — se a
 * fórmula mudar lá, mudar aqui junto; é só exibição, quem credita de verdade
 * é sempre o banco.
 *
 * Ciclos de 31 dias: dentro de um ciclo o bônus sobe +0,1%/dia a partir do
 * piso do ciclo, até travar no teto do ciclo; ao virar de ciclo o piso E o
 * teto sobem +2%, até o teto absoluto de 6%.
 *   dia 1 = 1,1% · dia 2 = 1,2% · dia 5 = 1,5% · dia 10..31 = 2,0% (trava)
 *   dia 32 = 3,1% (novo ciclo) · dia 41..62 = 4,0% (trava) · dia 92+ = 6,0%
 */

const CYCLE_LENGTH = 31
const STEP_BPS = 10 // 0,1% por dia
const CYCLE_BASE_BPS = 100 // 1,0% no primeiro dia de cada ciclo
const CYCLE_GAIN_BPS = 200 // +2,0% de piso/teto a cada ciclo novo
const MAX_BPS = 600 // 6,0% — teto absoluto

/** Multiplicador em basis points (1% = 100). 0 quando não há ofensiva ativa. */
export function streakAuraMultiplierBps(streakDays: number): number {
  if (streakDays <= 0) return 0
  const cycle = Math.floor((streakDays - 1) / CYCLE_LENGTH)
  const dayInCycle = ((streakDays - 1) % CYCLE_LENGTH) + 1
  const base = CYCLE_BASE_BPS + CYCLE_GAIN_BPS * cycle
  const cycleCeiling = Math.min(CYCLE_BASE_BPS + CYCLE_GAIN_BPS * (cycle + 1), MAX_BPS)
  return Math.min(base + dayInCycle * STEP_BPS, cycleCeiling, MAX_BPS)
}

/** Ex.: 150 bps -> "1,5%". */
export function formatStreakMultiplier(streakDays: number): string {
  const bps = streakAuraMultiplierBps(streakDays)
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/**
 * Bônus passivo de Aura para VIP — espelha o `v_vip_bps` de `apply_aura_gain`
 * (20260922000005_apply_aura_gain_vip_bonus.sql): +0,4% (40 bps) sempre que
 * VIP e sem ofensiva ativa hoje, ou +0,25% (25 bps) ADICIONAL ao bônus de
 * ofensiva quando ela estiver ativa. `hasActiveStreak` = streakDays > 0.
 */
export function vipAuraMultiplierBps(hasActiveStreak: boolean): number {
  return hasActiveStreak ? 25 : 40
}

/** Multiplicador total (ofensiva + VIP) em basis points, para exibição na UI. */
export function totalAuraMultiplierBps(streakDays: number, isVip: boolean): number {
  const streakBps = streakAuraMultiplierBps(streakDays)
  const vipBps = isVip ? vipAuraMultiplierBps(streakDays > 0) : 0
  return streakBps + vipBps
}

/** Ex.: 175 bps -> "1,75%". */
export function formatTotalAuraMultiplier(streakDays: number, isVip: boolean): string {
  const bps = totalAuraMultiplierBps(streakDays, isVip)
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
}

export type StreakHeatTier = "none" | "low" | "mid" | "high" | "max"

/**
 * Faixa de calor da ofensiva: quanto mais dias, mais para o vermelho — só
 * ofensivas baixas ficam no laranja de sempre. Alinhado aos limiares de ciclo
 * (31/62/93 dias) porque é quando o multiplicador sobe de patamar.
 */
export function streakHeatTier(streakDays: number): StreakHeatTier {
  if (streakDays <= 0) return "none"
  if (streakDays < 10) return "low"
  if (streakDays < 31) return "mid"
  if (streakDays < 62) return "high"
  return "max"
}

/** Texto + ícone (Tailwind) por faixa — do âmbar de baixa ofensiva ao vermelho intenso da ofensiva máxima. */
export const STREAK_HEAT_STYLES: Record<StreakHeatTier, { text: string; border: string; bg: string; glow: string }> = {
  none: { text: "text-muted-foreground", border: "border-border", bg: "bg-card/60", glow: "" },
  low: {
    text: "text-amber-400",
    border: "border-amber-400/40",
    bg: "bg-amber-400/10",
    glow: "drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]",
  },
  mid: {
    text: "text-orange-500",
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    glow: "drop-shadow-[0_0_5px_rgba(249,115,22,0.9)]",
  },
  high: {
    text: "text-orange-600",
    border: "border-orange-600/40",
    bg: "bg-orange-600/10",
    glow: "drop-shadow-[0_0_6px_rgba(234,88,12,0.9)]",
  },
  max: {
    text: "text-red-500",
    border: "border-red-500/50",
    bg: "bg-red-500/10",
    glow: "drop-shadow-[0_0_7px_rgba(239,68,68,0.95)]",
  },
}
