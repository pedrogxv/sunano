import type { Category } from "@/lib/tag-options"

/**
 * Sorteios — módulo PURO (tipos, raridades e rótulos), seguro no cliente.
 * As consultas moram em `lib/server/repositories/giveaways-repository.ts`.
 */

export type GiveawayRarity = "rare" | "special" | "legendary"

export type GiveawayStatus = "draft" | "open" | "closed" | "drawn"

/** Ordem de exibição: o mais valioso primeiro. */
export const GIVEAWAY_RARITIES: GiveawayRarity[] = ["legendary", "special", "rare"]

/**
 * A cor É a raridade (Azul = Raro, Vermelho = Especial, Amarelo = Lendário).
 * Fica toda aqui — card da Home, prévia do admin e filtro leem do mesmo
 * lugar, para o "Especial" não sair vermelho numa tela e rosa na outra.
 *
 * O amarelo do Lendário é ouro (amber/yellow), não o laranja da Aura: um
 * sorteio não custa nem paga Aura, e a chama tem cor própria.
 */
export const GIVEAWAY_RARITY_META: Record<
  GiveawayRarity,
  {
    label: string
    /** Classe do contêiner do card: define `--rarity` e `--rarity-soft`, lidas pelo CSS `.giveaway-card`. */
    themeClass: string
    /** Pílula com o nome da raridade. */
    chipClass: string
    /** Texto na cor da raridade. */
    textClass: string
  }
> = {
  rare: {
    label: "Raro",
    themeClass: "giveaway-rarity-rare",
    chipClass: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/40",
    textClass: "text-sky-300",
  },
  special: {
    label: "Especial",
    themeClass: "giveaway-rarity-special",
    chipClass: "bg-red-500/15 text-red-300 ring-1 ring-red-400/40",
    textClass: "text-red-300",
  },
  legendary: {
    label: "Lendário",
    themeClass: "giveaway-rarity-legendary",
    chipClass: "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/50",
    textClass: "text-amber-200",
  },
}

export function isGiveawayRarity(value: unknown): value is GiveawayRarity {
  return value === "rare" || value === "special" || value === "legendary"
}

/** Rótulo singular, o que vai em cima da foto do card ("GLASSPAD"). */
export const GIVEAWAY_CATEGORY_LABELS: Record<Category, string> = {
  keyboard: "Teclado",
  pcb: "PCB",
  mouse: "Mouse",
  mousepad: "Mousepad",
  glasspad: "Glasspad",
  iem: "IEM",
  headset: "Headset",
  feet: "Feet",
  chairs: "Cadeira",
  monitors: "Monitor",
  switches: "Switches",
  dac_amp: "DAC/AMP",
  psu: "Fonte",
}

export function giveawayCategoryLabel(category: string): string {
  return GIVEAWAY_CATEGORY_LABELS[category as Category] ?? category
}

/** O que a Home recebe de cada sorteio. */
export type PublicGiveaway = {
  id: string
  title: string
  category: string
  rarity: GiveawayRarity
  imageUrl: string | null
  /** Ficha do periférico no catálogo, quando o prêmio veio de lá. */
  peripheralHref: string | null
  maxParticipants: number
  entriesCount: number
  status: Exclude<GiveawayStatus, "draft">
  endsAt: string | null
  /** Nome de quem ganhou, depois do sorteio. */
  winnerName: string | null
}

/**
 * Sorteios que uma tela entrega já no HTML, com o que o cliente precisaria
 * buscar depois (participações e se a seção é pública).
 */
export type ViewerGiveaways = {
  giveaways: PublicGiveaway[]
  joinedIds: string[]
  /** Flag em "Todos". Fora disso a seção é prévia (WEB Master, equipe, gradual). */
  isPublic: boolean
}

export type GiveawayJoinCode = "joined" | "already" | "full" | "closed" | "not_found"

export const GIVEAWAY_JOIN_MESSAGES: Record<Exclude<GiveawayJoinCode, "joined">, string> = {
  already: "Você já está participando",
  full: "As vagas deste sorteio acabaram",
  closed: "Este sorteio já foi encerrado",
  not_found: "Sorteio não encontrado",
}
