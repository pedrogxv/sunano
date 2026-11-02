/**
 * Voto (útil / não útil) e reações nas Patch Notes. Módulo puro: a rota, o
 * repositório e a tela leem daqui, para a lista de reações e a chave de cada
 * versão serem uma só.
 */

/** Ordem de exibição. A chave é o que vai para o banco (check constraint). */
export const CHANGELOG_REACTIONS = [
  { key: "party", emoji: "🎉" },
  { key: "heart", emoji: "❤️" },
  { key: "rocket", emoji: "🚀" },
  { key: "mindblown", emoji: "🤯" },
  { key: "eyes", emoji: "👀" },
  { key: "confused", emoji: "😕" },
] as const

export type ChangelogReaction = (typeof CHANGELOG_REACTIONS)[number]["key"]

export const CHANGELOG_REACTION_KEYS = CHANGELOG_REACTIONS.map((r) => r.key) as [
  ChangelogReaction,
  ...ChangelogReaction[],
]

export type ChangelogVote = -1 | 0 | 1

export type ChangelogEntryFeedback = {
  up: number
  down: number
  reactions: Partial<Record<ChangelogReaction, number>>
  myVote: ChangelogVote
  myReactions: ChangelogReaction[]
}

export const EMPTY_FEEDBACK: ChangelogEntryFeedback = { up: 0, down: 0, reactions: {}, myVote: 0, myReactions: [] }

/** Mesmo formato que o check do banco aceita. */
export const CHANGELOG_KEY_PATTERN = /^[a-z0-9-]{1,64}$/

function slug(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "versao"
  )
}

/**
 * Chave de cada entrada, IGUAL nos dois idiomas, na mesma ordem de `entries`.
 *
 * A âncora (`#v0-5-0`) não serve: as entradas antigas se chamam "Agosto 2026"
 * em pt-BR e "August 2026" em inglês, e o voto de quem lê em inglês cairia
 * numa versão que o português não conhece. Versão semver tem o mesmo rótulo
 * nas duas línguas e usa ele; as mensais (histórico congelado, nunca ganham
 * entrada nova) viram `legacy-<n>`, contadas a partir da MAIS ANTIGA, para a
 * chave não andar quando uma versão nova entra no topo.
 */
export function changelogFeedbackKeys(entries: readonly { version: string }[]): string[] {
  const legacyTotal = entries.filter((e) => !e.version.trim().startsWith("v")).length
  let legacySeen = 0
  return entries.map((entry) => {
    const label = entry.version.split(" · ")[0].trim()
    if (label.startsWith("v")) return slug(label)
    legacySeen += 1
    return `legacy-${legacyTotal - legacySeen + 1}`
  })
}
