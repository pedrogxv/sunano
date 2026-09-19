/**
 * Trust Factor — módulo puro do sistema de confiança da plataforma.
 *
 * Aura mede PARTICIPAÇÃO e progressão. Trust Factor mede COMPORTAMENTO,
 * integridade e confiança. São eixos independentes: farmar Aura não compra
 * confiança, e uma conta impecável que nunca postou não tem Aura.
 *
 * Este arquivo é o espelho em TS do que a migration `20261129000000_trust_factor.sql`
 * define no banco. O BANCO é quem manda: é ele que grava `trust_score` /
 * `trust_level` e que decide quem de fato resgata. Mudar um número aqui sem
 * mudar lá faz a tela prometer o que o banco recusa — o mesmo erro que já
 * aconteceu com `VIP_FOUNDER_DEADLINE`.
 *
 * Sem I/O: só tabelas, faixas e rótulos. Quem lê o banco é
 * `lib/server/repositories/trust-repository.ts`.
 */

/** Faixas internas. O usuário vê só o rótulo — nunca a pontuação exata. */
export type TrustLevel = "low" | "regular" | "good" | "very_good" | "excellent"

/**
 * Estado administrativo da conta, independente da nota. Uma conta pode ser
 * `restricted` com nota 95 (flag de segurança levantada) e `active` com 20:
 * "uma flag pode bloquear funções específicas mesmo que a pontuação ainda
 * esteja alta".
 */
export type TrustStatus = "active" | "watch" | "restricted" | "blocked"

/** Toda conta nasce aqui: sem histórico para ser confiável nem problemático. */
export const TRUST_BASE_SCORE = 50

/**
 * Corte para resgatar item FÍSICO e limitado da Central de Aura ("Muito Bom").
 * Espelha `can_redeem_physical_item` na migration — é a função do banco que
 * decide de fato; aqui é só para a tela saber o que desenhar.
 *
 * O corte é alto de propósito: com o teto de maturidade (59/69/79), NENHUMA
 * conta com menos de 90 dias alcança 80, então a trava cobre multi-conta sem
 * precisar de uma regra de idade à parte.
 */
export const TRUST_PHYSICAL_REDEEM_MIN = 80

/** Ganho máximo por atividade normal num mesmo dia. Penalidade não respeita teto. */
export const TRUST_DAILY_GAIN_CAP = 3

type TrustLevelMeta = {
  level: TrustLevel
  /** Nota mínima da faixa (inclusive). */
  min: number
  max: number
  label: string
  /** Frase curta para o usuário — nunca cita a pontuação exata. */
  description: string
}

/**
 * As cinco faixas, da mais baixa para a mais alta. Espelha `trust_level_of()`
 * no banco.
 */
export const TRUST_LEVELS: TrustLevelMeta[] = [
  {
    level: "low",
    min: 0,
    max: 39,
    label: "Baixo",
    description: "Histórico com infrações recentes. Funções sensíveis ficam limitadas.",
  },
  {
    level: "regular",
    min: 40,
    max: 59,
    label: "Regular",
    description: "Conta ainda sem histórico suficiente, ou se recuperando de alguma infração.",
  },
  {
    level: "good",
    min: 60,
    max: 79,
    label: "Bom",
    description: "Participação legítima e sem punições ativas.",
  },
  {
    level: "very_good",
    min: 80,
    max: 89,
    label: "Muito Bom",
    description: "Histórico consistente e contribuições úteis ao longo do tempo.",
  },
  {
    level: "excellent",
    min: 90,
    max: 100,
    label: "Excelente",
    description: "Referência da comunidade: tempo de casa, contribuição e zero problemas.",
  },
]

const LEVEL_BY_KEY = new Map(TRUST_LEVELS.map((entry) => [entry.level, entry]))

/** Ordem crescente — para comparar "é pelo menos X". */
export const TRUST_LEVEL_ORDER: TrustLevel[] = TRUST_LEVELS.map((entry) => entry.level)

export function trustLevelOf(score: number): TrustLevel {
  if (score >= 90) return "excellent"
  if (score >= 80) return "very_good"
  if (score >= 60) return "good"
  if (score >= 40) return "regular"
  return "low"
}

export function trustLevelMeta(level: TrustLevel): TrustLevelMeta {
  return LEVEL_BY_KEY.get(level) ?? TRUST_LEVELS[1]
}

export function trustLevelLabel(level: TrustLevel): string {
  return trustLevelMeta(level).label
}

/** `true` quando `level` é igual ou superior a `minimum` na escala das faixas. */
export function isTrustLevelAtLeast(level: TrustLevel, minimum: TrustLevel): boolean {
  return TRUST_LEVEL_ORDER.indexOf(level) >= TRUST_LEVEL_ORDER.indexOf(minimum)
}

/**
 * Paleta do selo, por faixa. TOKENS, nunca literais soltos na tela — a mesma
 * régua de `STREAK_HEAT_STYLES`: quem escrever a cor à mão num componente novo
 * recria o problema das cinco chamas em cinco tons.
 *
 * O EIXO DE COR é próprio do Trust e não se repete em outro lugar do site:
 * Aura é fogo + rampa quente (vermelho→laranja→amarelo) e Ofensiva é
 * turquesa→ciano. O Trust sobe por uma rampa FRIA→NOBRE
 * (vermelho→âmbar→sky→esmeralda→violeta), então nenhuma faixa se confunde com
 * um selo de Aura ou de Ofensiva a um relance.
 *
 * `glow` só é usado pelas duas faixas de cima: o brilho é o que premia visualmente
 * quem chegou lá. Se todas brilhassem, nenhuma brilharia.
 */
export type TrustLevelStyle = {
  /** Cor do ícone e do texto. */
  text: string
  border: string
  bg: string
  /** Halo do pássaro. Vazio nas faixas baixas — brilho é privilégio do topo. */
  glow: string
  /** Gradiente do anel do selo grande (`TrustSeal`). */
  ring: string
}

export const TRUST_LEVEL_STYLE: Record<TrustLevel, TrustLevelStyle> = {
  low: {
    text: "text-red-400",
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    glow: "",
    ring: "from-red-500/50 to-red-500/5",
  },
  regular: {
    text: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    glow: "",
    ring: "from-amber-400/50 to-amber-400/5",
  },
  good: {
    text: "text-sky-400",
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
    glow: "",
    ring: "from-sky-400/60 to-sky-400/5",
  },
  very_good: {
    text: "text-emerald-400",
    border: "border-emerald-500/45",
    bg: "bg-emerald-500/10",
    glow: "drop-shadow-[0_0_5px_rgba(52,211,153,0.85)]",
    ring: "from-emerald-400/70 to-emerald-400/5",
  },
  excellent: {
    text: "text-violet-300",
    border: "border-violet-500/45",
    bg: "bg-violet-500/10",
    glow: "drop-shadow-[0_0_7px_rgba(196,181,253,0.95)]",
    ring: "from-violet-400/80 to-violet-400/5",
  },
}

/**
 * Classes prontas do selo compacto (borda + fundo + texto), para quem só quer
 * a pílula. Derivado de `TRUST_LEVEL_STYLE` para não haver duas listas de cor.
 */
export const TRUST_LEVEL_CLASS: Record<TrustLevel, string> = Object.fromEntries(
  (Object.keys(TRUST_LEVEL_STYLE) as TrustLevel[]).map((level) => {
    const style = TRUST_LEVEL_STYLE[level]
    return [level, `${style.border} ${style.bg} ${style.text}`]
  })
) as Record<TrustLevel, string>

export const TRUST_STATUS_LABEL: Record<TrustStatus, string> = {
  active: "Normal",
  watch: "Em observação",
  restricted: "Restrita",
  blocked: "Bloqueada",
}

export const TRUST_STATUS_CLASS: Record<TrustStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  restricted: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-400",
}

/**
 * Teto temporário por idade de conta — espelha `trust_maturity_cap()`.
 * Impede que conta nova alcance reputação máxima rapidamente. É TETO, não
 * penalidade: não tira pontos, só limita o quanto a soma pode subir.
 */
export const TRUST_MATURITY_CAPS: Array<{ afterDays: number; cap: number }> = [
  { afterDays: 0, cap: 59 },
  { afterDays: 7, cap: 69 },
  { afterDays: 30, cap: 79 },
  { afterDays: 90, cap: 100 },
]

export function trustMaturityCap(accountCreatedAt: string | Date | null): number {
  if (!accountCreatedAt) return 59
  const created = new Date(accountCreatedAt).getTime()
  if (Number.isNaN(created)) return 59
  const days = (Date.now() - created) / 86_400_000
  if (days < 7) return 59
  if (days < 30) return 69
  if (days < 90) return 79
  return 100
}

/**
 * Severidade governa a RECUPERAÇÃO, não o tamanho do impacto. Espelha
 * `trust_event_weight()`: a penalidade não é apagada, ela perde peso.
 */
export type TrustSeverity = "positive" | "light" | "medium" | "heavy" | "critical"

export const TRUST_SEVERITY_LABEL: Record<TrustSeverity, string> = {
  positive: "Positivo",
  light: "Leve",
  medium: "Média",
  heavy: "Grave",
  critical: "Crítica",
}

/** Texto de recuperação por severidade, para o painel e para a página pública. */
export const TRUST_RECOVERY_TEXT: Record<TrustSeverity, string> = {
  positive: "Não expira.",
  light: "Começa a perder peso após 30 dias.",
  medium: "Recuperação em cerca de 90 dias.",
  heavy: "Recuperação em cerca de 180 dias.",
  critical: "Sem recuperação automática — só análise manual.",
}

export type TrustEventSource = "system" | "moderation" | "admin" | "tester" | "cron" | "security"

/**
 * Catálogo de eventos. O `points` aqui é o impacto BRUTO sugerido; o banco
 * apara o lado positivo pelo teto diário de +3 e decai o negativo pela
 * severidade. Quem dispara é sempre `applyTrustEvent`, nunca um UPDATE direto
 * em `trust_score`.
 */
export type TrustEventType =
  // Positivos — atividade legítima
  | "helpful_contribution"
  | "review_approved"
  | "mission_streak"
  | "clean_record"
  // Negativos — moderação
  | "content_removed"
  | "warning"
  | "spam_farming"
  | "mute"
  | "false_information"
  | "suspension"
  | "fraud_manipulation"
  | "critical_fraud"
  // Sunano Tester
  | "tester_cycle_completed"
  | "tester_records_complete"
  | "tester_quality_feedback"
  | "tester_unjustified_delay"
  | "tester_no_tracking"
  | "tester_ignored_team"
  | "tester_misuse_damage"
  | "tester_theft_fraud"
  // Administrativo
  | "trust_status_changed"
  | "admin_adjustment"

export type TrustEventDefinition = {
  type: TrustEventType
  label: string
  /** Impacto sugerido. Negativo = penalidade. */
  points: number
  severity: TrustSeverity
  source: TrustEventSource
  /** Faixa quando o documento define um intervalo (ex: fraude -20 a -40). */
  range?: [number, number]
}

/**
 * Impactos do documento do Trust Factor (§3, §4 e §11). Os valores de faixa
 * ("-20 a -40") entram com o piso do intervalo como padrão e o `range` para o
 * admin escolher — aplicar o topo por default puniria o caso brando com a
 * régua do caso grave.
 */
export const TRUST_EVENTS: Record<TrustEventType, TrustEventDefinition> = {
  helpful_contribution: {
    type: "helpful_contribution",
    label: "Contribuição útil (post, comentário ou review)",
    points: 1,
    severity: "positive",
    source: "system",
  },
  review_approved: {
    type: "review_approved",
    label: "Review relevante aprovada",
    points: 1,
    severity: "positive",
    source: "system",
  },
  mission_streak: {
    type: "mission_streak",
    label: "Missões e compromissos cumpridos",
    points: 1,
    severity: "positive",
    source: "system",
  },
  clean_record: {
    type: "clean_record",
    label: "Conta mantida sem punições",
    points: 1,
    severity: "positive",
    source: "cron",
  },

  content_removed: {
    type: "content_removed",
    label: "Conteúdo removido por infração",
    points: -2,
    severity: "light",
    source: "moderation",
    range: [-2, -1],
  },
  warning: {
    type: "warning",
    label: "Warning",
    points: -5,
    severity: "light",
    source: "moderation",
  },
  spam_farming: {
    type: "spam_farming",
    label: "Spam ou farming",
    points: -5,
    severity: "medium",
    source: "security",
  },
  mute: {
    type: "mute",
    label: "Mute",
    points: -8,
    severity: "medium",
    source: "moderation",
  },
  false_information: {
    type: "false_information",
    label: "Informações falsas",
    points: -10,
    severity: "medium",
    source: "moderation",
  },
  suspension: {
    type: "suspension",
    label: "Suspensão",
    points: -15,
    severity: "heavy",
    source: "moderation",
  },
  fraud_manipulation: {
    type: "fraud_manipulation",
    label: "Fraude ou manipulação",
    points: -20,
    severity: "heavy",
    source: "security",
    range: [-40, -20],
  },
  critical_fraud: {
    type: "critical_fraud",
    label: "Furto / fraude crítica",
    points: -100,
    severity: "critical",
    source: "security",
  },

  tester_cycle_completed: {
    type: "tester_cycle_completed",
    label: "Ciclo do Tester concluído corretamente",
    points: 3,
    severity: "positive",
    source: "tester",
  },
  tester_records_complete: {
    type: "tester_records_complete",
    label: "Registros completos (Tester)",
    points: 1,
    severity: "positive",
    source: "tester",
  },
  tester_quality_feedback: {
    type: "tester_quality_feedback",
    label: "Feedback de alta qualidade (Tester)",
    points: 1,
    severity: "positive",
    source: "tester",
  },
  tester_unjustified_delay: {
    type: "tester_unjustified_delay",
    label: "Atraso injustificado (Tester)",
    points: -5,
    severity: "medium",
    source: "tester",
  },
  tester_no_tracking: {
    type: "tester_no_tracking",
    label: "Ausência de rastreamento (Tester)",
    points: -5,
    severity: "medium",
    source: "tester",
  },
  tester_ignored_team: {
    type: "tester_ignored_team",
    label: "Ignorar a equipe (Tester)",
    points: -5,
    severity: "medium",
    source: "tester",
    range: [-10, -5],
  },
  tester_misuse_damage: {
    type: "tester_misuse_damage",
    label: "Dano por mau uso (Tester)",
    points: -15,
    severity: "heavy",
    source: "tester",
    range: [-30, -15],
  },
  tester_theft_fraud: {
    type: "tester_theft_fraud",
    label: "Furto ou fraude (Tester)",
    points: -100,
    severity: "critical",
    source: "tester",
  },

  trust_status_changed: {
    type: "trust_status_changed",
    label: "Estado da conta alterado",
    points: 0,
    severity: "positive",
    source: "admin",
  },
  admin_adjustment: {
    type: "admin_adjustment",
    label: "Ajuste manual da equipe",
    points: 0,
    severity: "light",
    source: "admin",
  },
}

/** Eventos que o admin pode aplicar à mão, na ordem em que aparecem no painel. */
export const TRUST_MANUAL_EVENTS: TrustEventType[] = [
  "content_removed",
  "warning",
  "spam_farming",
  "mute",
  "false_information",
  "suspension",
  "fraud_manipulation",
  "critical_fraud",
  "tester_cycle_completed",
  "tester_records_complete",
  "tester_quality_feedback",
  "tester_unjustified_delay",
  "tester_no_tracking",
  "tester_ignored_team",
  "tester_misuse_damage",
  "tester_theft_fraud",
  "admin_adjustment",
]

/**
 * Flags de segurança (§9 do documento). Uma flag pode bloquear funções
 * específicas MESMO com pontuação alta — por isso ela mora em
 * `trust_status`/`trust_flags`, e não numa comparação de nota.
 */
export type TrustFlag =
  | "AURA_FARMING"
  | "MULTI_ACCOUNT"
  | "SPAM"
  | "FRAUD_SUSPECTED"
  | "TESTER_DISPUTE"
  | "IDENTITY_REVIEW"

export const TRUST_FLAGS: TrustFlag[] = [
  "AURA_FARMING",
  "MULTI_ACCOUNT",
  "SPAM",
  "FRAUD_SUSPECTED",
  "TESTER_DISPUTE",
  "IDENTITY_REVIEW",
]

export const TRUST_FLAG_LABEL: Record<TrustFlag, string> = {
  AURA_FARMING: "Farming de Aura",
  MULTI_ACCOUNT: "Múltiplas contas",
  SPAM: "Spam",
  FRAUD_SUSPECTED: "Suspeita de fraude",
  TESTER_DISPUTE: "Disputa no Tester",
  IDENTITY_REVIEW: "Identidade em análise",
}

export const TRUST_FLAG_DESCRIPTION: Record<TrustFlag, string> = {
  AURA_FARMING: "Padrão de ganho artificial de Aura (reações trocadas, conteúdo repetitivo).",
  MULTI_ACCOUNT: "Indício de mais de uma conta operada pela mesma pessoa.",
  SPAM: "Publicação repetitiva ou divulgação não solicitada.",
  FRAUD_SUSPECTED: "Suspeita de fraude em pagamento, indicação ou resgate.",
  TESTER_DISPUTE: "Pendência aberta num ciclo do Sunano Tester.",
  IDENTITY_REVIEW: "Documentos ou identidade em verificação pela equipe.",
}

/**
 * Regras do Sunano Tester (§10). Deriva da nota, nunca de um campo à parte —
 * duplicar isso num booleano do perfil é o que faria o requisito divergir da
 * pontuação real.
 */
export const TESTER_APPLICATION_MIN_LEVEL: TrustLevel = "good"
/** Abaixo disto não pode ser selecionado para novas oportunidades. */
export const TESTER_SELECTION_MIN_SCORE = 60
/** Abaixo disto a participação no Tester é suspensa para análise. */
export const TESTER_SUSPENSION_SCORE = 40

export type TesterEligibility = "eligible" | "not_selectable" | "suspended" | "blocked"

export function testerEligibility(score: number, status: TrustStatus): TesterEligibility {
  if (status === "blocked") return "blocked"
  if (score < TESTER_SUSPENSION_SCORE) return "suspended"
  if (score < TESTER_SELECTION_MIN_SCORE || status === "restricted") return "not_selectable"
  return "eligible"
}

/**
 * Pode resgatar item FÍSICO e limitado da Central de Aura? Espelha
 * `can_redeem_physical_item()`. O banco é quem barra de fato (a RPC recusa com
 * `not_verified`); esta função existe para a tela não oferecer o que será
 * recusado.
 */
export function canRedeemPhysicalItem(score: number, status: TrustStatus): boolean {
  return score >= TRUST_PHYSICAL_REDEEM_MIN && status === "active"
}

/** Faixa mínima exigida pelo resgate físico, para o texto da trava. */
export const TRUST_PHYSICAL_REDEEM_LEVEL: TrustLevel = trustLevelOf(TRUST_PHYSICAL_REDEEM_MIN)
