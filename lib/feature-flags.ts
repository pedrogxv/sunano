import type { AdminRole } from "@/lib/admin-permissions"

/**
 * Feature flags — módulo PURO (seguro no cliente e no servidor).
 *
 * Modelo, no padrão das ferramentas de mercado (LaunchDarkly, Unleash,
 * OpenFeature), adaptado ao que o site já tem:
 *
 *  - A DEFINIÇÃO mora aqui, no código: nome, descrição, tipo e o fallback.
 *    Uma flag que o código não declara não existe, e o TypeScript obriga cada
 *    `useFeatureFlag("x")` a usar uma chave registrada.
 *  - O ESTADO mora no banco (`feature_flags`), mudado pelo WEB MASTER em
 *    /admin/feature-flags sem deploy. Linha ausente cai no fallback, que é
 *    sempre "off": se o banco falhar, nada sai ao público por acidente.
 *  - A AVALIAÇÃO é feita no SERVIDOR (`lib/server/feature-flags.ts`). O
 *    cliente recebe só a lista das flags ligadas para ele, nunca a regra —
 *    esconder uma seção no client não é segurança, então toda rota da
 *    feature confere a flag de novo.
 *
 * Ao lançar de vez (modo "everyone" estável), apague a flag do código e do
 * banco: flag de lançamento que vira permanente é dívida (o painel avisa).
 */

export type FeatureFlagMode = "off" | "webmaster" | "staff" | "percentage" | "everyone"

/**
 * - `release`: esconde uma feature em construção; nasce para morrer.
 * - `ops`: chave de desligar algo em produção (kill switch); pode ser longa.
 * - `experiment`: comparação entre variantes, com prazo.
 */
export type FeatureFlagKind = "release" | "ops" | "experiment"

export type FeatureFlagDefinition = {
  label: string
  description: string
  kind: FeatureFlagKind
  /** Data em que a flag entrou no código (YYYY-MM-DD) — base do aviso de flag velha. */
  createdAt: string
  /** Onde a flag age, para quem for removê-la saber o que apagar. */
  surfaces: string[]
}

export const FEATURE_FLAGS = {
  giveaways: {
    label: "Sorteios",
    description:
      "Seção 🎉 Sorteios na Home (Raro, Especial e Lendário) e a participação dos membros",
    kind: "release",
    createdAt: "2026-11-01",
    surfaces: ["Home", "/api/giveaways"],
  },
} as const satisfies Record<string, FeatureFlagDefinition>

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === "string" && Object.hasOwn(FEATURE_FLAGS, value)
}

export type FeatureFlagConfig = {
  mode: FeatureFlagMode
  /** Só vale no modo "percentage". */
  rolloutPercent: number
  /** Testadores: veem a flag em qualquer modo, menos "off". */
  allowUserIds: string[]
  note: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export const FEATURE_FLAG_FALLBACK: FeatureFlagConfig = {
  mode: "off",
  rolloutPercent: 0,
  allowUserIds: [],
  note: null,
  updatedAt: null,
  updatedBy: null,
}

export const FEATURE_FLAG_MODES: FeatureFlagMode[] = ["off", "webmaster", "staff", "percentage", "everyone"]

export const FEATURE_FLAG_MODE_META: Record<FeatureFlagMode, { label: string; hint: string }> = {
  off: { label: "Desligada", hint: "Ninguém vê, nem a allowlist" },
  webmaster: { label: "WEB Master", hint: "Só quem tem o cargo WEB Master" },
  staff: { label: "Equipe", hint: "Qualquer cargo do painel" },
  percentage: { label: "Gradual", hint: "Equipe + uma fatia fixa dos membros logados" },
  everyone: { label: "Todos", hint: "Público, inclusive quem não tem conta" },
}

/** Quem está pedindo. `role` null = sem cargo no painel; `userId` null = visitante. */
export type FeatureFlagContext = {
  userId: string | null
  role: AdminRole | null
}

export const ANONYMOUS_FLAG_CONTEXT: FeatureFlagContext = { userId: null, role: null }

/**
 * Fatia 0–99 do usuário para a flag. FNV-1a sobre `flag:userId`:
 *
 *  - Estável: a mesma pessoa cai sempre na mesma fatia, então ela não vê a
 *    seção aparecer e sumir entre visitas.
 *  - Monotônica: subir de 10% para 25% só ACRESCENTA gente; quem já via
 *    continua vendo (fatia < 10 também é < 25).
 *  - Independente por flag: a chave entra no hash, senão os mesmos 10% de
 *    usuários seriam cobaia de toda feature nova.
 */
export function rolloutBucket(flagKey: string, userId: string): number {
  let hash = 0x811c9dc5
  const input = `${flagKey}:${userId}`
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 100
}

export function evaluateFeatureFlag(
  key: FeatureFlagKey,
  config: FeatureFlagConfig,
  context: FeatureFlagContext
): boolean {
  // Kill switch: "off" vale sobre tudo, inclusive a allowlist e o WEB MASTER.
  if (config.mode === "off") return false
  if (config.mode === "everyone") return true

  const isAllowlisted = context.userId !== null && config.allowUserIds.includes(context.userId)
  // WEB MASTER vê toda flag que não está desligada: é quem decide liberá-la.
  if (context.role === "webmaster" || isAllowlisted) return true

  switch (config.mode) {
    case "webmaster":
      return false
    case "staff":
      return context.role !== null
    case "percentage":
      if (context.role !== null) return true
      return context.userId !== null && rolloutBucket(key, context.userId) < config.rolloutPercent
  }
}

/** Dias que uma flag de lançamento pode ficar em "Todos" antes do painel pedir a remoção. */
export const STALE_RELEASE_FLAG_DAYS = 30
