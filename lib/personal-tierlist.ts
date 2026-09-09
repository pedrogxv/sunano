/**
 * Tipos da tierlist pessoal (VIP).
 *
 * Vive fora de `lib/server/**` porque Client Components (editor) e o módulo
 * de tema precisam destas formas. O repositório
 * (`lib/server/repositories/user-tierlist-repository.ts`) re-exporta daqui,
 * então o resto do código pode continuar importando de lá — mesmo padrão de
 * `lib/profile-showcase.ts`.
 */

import type { Ratings } from "@/components/tierlist/TierItemTooltipContent"

/**
 * Tier definido pelo próprio usuário — nome e cor livres, entre 2 e 6 por
 * pessoa (`TIERLIST_MIN_TIERS`/`TIERLIST_MAX_TIERS`). Substituiu o antigo
 * literal fixo `"S"|"A"|"B"|"C"|"D"`.
 */
export type TierlistTierDef = {
  id: string
  label: string
  /** Hex de 6 dígitos, ex. `"#F97316"`. */
  color: string
  position: number
}

export const TIERLIST_MIN_TIERS = 2
export const TIERLIST_MAX_TIERS = 6
export const TIERLIST_TIER_LABEL_MAX_LENGTH = 12

export type TierlistItem = {
  peripheralId: string
  tierId: string
  position: number
  peripheral: {
    id: string
    name: string
    brandName: string | null
    category: string
    imageUrl: string | null
    /** Tier oficial do site (GOAT..L) — o hover mostra os dois: o veredito do site e o do membro. */
    siteTier: string | null
    /** Tags do catálogo, para os chips do hover. */
    tags: string[]
    /** Notas públicas extraídas de `specs.details.ratings`, para as barras do hover. */
    ratings: Ratings
  }
}

/**
 * Limite do mini comentário que o dono deixa na própria tierlist.
 *
 * Vive aqui (módulo puro) porque o contador do editor é Client Component e a
 * rota de API valida com o mesmo número; a constraint em
 * `user_tierlist_meta.note` é a terceira cópia, de última linha.
 */
export const TIERLIST_NOTE_MAX_LENGTH = 280

/** Recado curto do dono + corações da tierlist, do jeito que a UI consome. */
export type TierlistMeta = {
  /** Mini comentário do dono (`null` quando não escreveu). */
  note: string | null
  heartsCount: number
  /** O visitante atual já deu coração? `false` para quem não está logado. */
  viewerHearted: boolean
}
