import {
  Crown,
  Frame,
  Keyboard,
  Layers,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import type { AuraItemKind } from "@/lib/server/repositories/aura-store-repository"

/**
 * Fonte única da identidade visual e das regras de cada `kind` de item da
 * Central de Aura. O admin (listagem, formulário, histórico de compras) lia
 * isso de três tabelas de labels divergentes — uma dizia "Moldura", outra
 * "Moldura de avatar", e só a de compras tinha ícone/cor. Tudo passa por aqui
 * agora.
 *
 * A distinção que o catálogo precisa deixar óbvia é `group`:
 *
 * - `physical` — sai do estoque do mundo real. Cada resgate tira uma unidade,
 *   o item some da Central quando zera, exige nível verificado e endereço de
 *   entrega, e vira linha em `store_orders`. Erro aqui custa dinheiro.
 * - `cosmetic` — bem digital, ilimitado. Resgate só concede posse.
 * - `system` — benefício com RPC e slug próprios (VIP, escudo, troca de nome).
 *   Não se cria nem se converte pelo admin: o código depende do slug.
 */
export type AuraItemKindGroup = "physical" | "cosmetic" | "system"

export type AuraItemKindMeta = {
  /** Nome curto, para badges e filtros. */
  label: string
  /** Nome completo, para selects e títulos de formulário. */
  longLabel: string
  /** Uma linha explicando o que o resgate entrega. */
  blurb: string
  icon: LucideIcon
  group: AuraItemKindGroup
  /** Classe de badge (texto + fundo + borda) já pronta. */
  badgeClassName: string
  /** Cor sólida para auras/realces — use com opacidade. */
  accentClassName: string
}

export const AURA_ITEM_KIND_META: Record<AuraItemKind, AuraItemKindMeta> = {
  peripheral: {
    label: "Produto",
    longLabel: "Produto físico (prêmio real)",
    blurb: "Prêmio real enviado pelo correio. Consome estoque e exige endereço.",
    icon: Keyboard,
    group: "physical",
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    accentClassName: "bg-amber-500",
  },
  avatar_frame: {
    label: "Moldura",
    longLabel: "Moldura de avatar",
    blurb: "Asset transparente sobreposto ao avatar. Ilimitado.",
    icon: Frame,
    group: "cosmetic",
    badgeClassName: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    accentClassName: "bg-violet-500",
  },
  mini_profile_bg: {
    label: "Fundo de perfil",
    longLabel: "Fundo de Mini Perfil",
    blurb: "Arte animada do mini perfil, amarrada por slug no código.",
    icon: Layers,
    group: "cosmetic",
    badgeClassName: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
    accentClassName: "bg-fuchsia-500",
  },
  vip_month: {
    label: "VIP",
    longLabel: "VIP (1 mês)",
    blurb: "Concede 30 dias de assinatura VIP via RPC própria.",
    icon: Crown,
    group: "system",
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    accentClassName: "bg-amber-500",
  },
  streak_shield: {
    label: "Escudo",
    longLabel: "Proteção de Ofensiva",
    blurb: "Congela a ofensiva por 1 ou 3 dias. Não acumula.",
    icon: ShieldCheck,
    group: "system",
    badgeClassName: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    accentClassName: "bg-cyan-500",
  },
  display_name_change: {
    label: "Troca de nome",
    longLabel: "Troca de nome de exibição",
    blurb: "Libera uma alteração do nome de exibição.",
    icon: UserRound,
    group: "system",
    badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    accentClassName: "bg-sky-500",
  },
}

/** Fallback para um `kind` que o banco tenha e o front ainda não conheça. */
export const AURA_ITEM_KIND_FALLBACK: AuraItemKindMeta = {
  label: "Item",
  longLabel: "Item de Aura",
  blurb: "Tipo desconhecido por esta versão do painel.",
  icon: Sparkles,
  group: "system",
  badgeClassName: "border-border bg-muted/40 text-muted-foreground",
  accentClassName: "bg-slate-500",
}

export function auraItemKindMeta(kind: AuraItemKind | string): AuraItemKindMeta {
  return AURA_ITEM_KIND_META[kind as AuraItemKind] ?? AURA_ITEM_KIND_FALLBACK
}

export const AURA_ITEM_GROUP_META: Record<
  AuraItemKindGroup,
  { label: string; description: string; icon: LucideIcon }
> = {
  physical: {
    label: "Prêmios físicos",
    description:
      "Estoque real e finito. Cada resgate reserva uma unidade, gera pedido de entrega e só nível verificado pode pegar — 1 por pessoa.",
    icon: Keyboard,
  },
  cosmetic: {
    label: "Cosméticos",
    description: "Bens digitais ilimitados. Nenhum resgate esgota nada.",
    icon: Sparkles,
  },
  system: {
    label: "Benefícios do sistema",
    description:
      "Ligados a RPC e slug fixos no código. Dá pra ajustar preço, texto e visibilidade — não o tipo.",
    icon: ShieldCheck,
  },
}

/** Ordem em que os grupos aparecem no catálogo: o que dá prejuízo primeiro. */
export const AURA_ITEM_GROUP_ORDER: readonly AuraItemKindGroup[] = [
  "physical",
  "cosmetic",
  "system",
] as const

/**
 * Todos os kinds na mesma ordem do catálogo (físico → cosmético → sistema),
 * para selects e filtros não divergirem da listagem.
 */
export const AURA_ITEM_KIND_ORDER: readonly AuraItemKind[] = AURA_ITEM_GROUP_ORDER.flatMap(
  (group) =>
    (Object.keys(AURA_ITEM_KIND_META) as AuraItemKind[]).filter(
      (kind) => AURA_ITEM_KIND_META[kind].group === group
    )
)

/** Kinds que o admin pode criar e converter entre si (o resto tem slug fixo). */
export const CONVERTIBLE_AURA_ITEM_KINDS: readonly AuraItemKind[] = [
  "avatar_frame",
  "peripheral",
] as const

export function isConvertibleAuraItemKind(kind: AuraItemKind | string): boolean {
  return (CONVERTIBLE_AURA_ITEM_KINDS as readonly string[]).includes(kind)
}

/** Só `peripheral` tem estoque de verdade; nos outros a coluna é ruído. */
export function auraItemTracksStock(kind: AuraItemKind | string): boolean {
  return auraItemKindMeta(kind).group === "physical"
}
