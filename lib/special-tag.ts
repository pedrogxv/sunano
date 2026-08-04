/**
 * Tags especiais por slug — independentes do tier de conta (`account-tier.ts`).
 *
 * Ao contrário do tier (ordinal, um por conta), uma tag especial só existe
 * para contas específicas e se soma ao badge de tier no perfil público
 * (ex: um VIP+ pode também ter a tag SUNANO). Mesmo padrão hardcoded-por-slug
 * já usado em `RESERVED_SLUGS` (`lib/profile-name.ts`) para proteger o nome.
 */

export type SpecialTag = {
  label: string
  className: string
}

/**
 * Slug do dono do site — mesmo valor reservado em `RESERVED_SLUGS`
 * (`lib/profile-name.ts`). Fonte única para identificá-lo onde ele precisa
 * ser tratado como caso especial (aqui, e no filtro dos rankings de Aura em
 * `users-repository.ts`/`aura-repository.ts`).
 */
export const SITE_OWNER_SLUG = "sunano"

const SPECIAL_TAGS: Record<string, SpecialTag> = {
  [SITE_OWNER_SLUG]: {
    label: "SUNANO",
    className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
  },
}

/** Resolve a tag especial de um slug de perfil, se houver. */
export function getSpecialTag(slug: string | null | undefined): SpecialTag | null {
  if (!slug) return null
  return SPECIAL_TAGS[slug] ?? null
}
