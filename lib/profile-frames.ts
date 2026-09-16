/**
 * Molduras de avatar — catálogo único e regra de resolução.
 *
 * ## Por que este módulo existe
 *
 * Antes, "moldura" era três coisas soltas: o anel metálico do pódio
 * (`podium-metal`, só em `PodiumSection`), a borda dourada do VIP (repetida
 * em `AvatarQuadrado`, `PersonAvatar`, `ProfileCard`…) e o PNG cosmético da
 * Central de Aura (`aura_items.frame_asset_url`, só lido no perfil). Cada
 * tela reimplementava a sua, então a mesma pessoa aparecia com anel no
 * pódio, coroa na grade e nada no fórum.
 *
 * Aqui elas viram **um tipo só** (`ProfileFrame`) com **uma ordem de
 * precedência** (`resolveProfileFrame`). Quem desenha é sempre
 * `components/ui/ProfileAvatar.tsx` — nenhum componente deve montar borda,
 * anel ou coroa de avatar por conta própria.
 *
 * ## Moldura é item equipável, não `if` no código
 *
 * O alvo é o mesmo modelo de `lib/mini-profile-backgrounds.ts`: o BANCO
 * guarda posse, preço e slug (`aura_items` + `user_aura_items` +
 * `user_profiles.equipped_avatar_frame_id`); o CÓDIGO guarda a arte, amarrada
 * pelo `slug`. Molduras de rank e de VIP nasceram aqui como itens de
 * catálogo (`source: "rank"` / `"vip"`) — não-compráveis, concedidas por
 * mérito/assinatura — para que o dia em que virassem posse de verdade em
 * `user_aura_items` não exigisse tocar em nenhum componente. As duas JÁ
 * viraram (rank pelo cron `/api/cron/rank-frames`, VIP pelo trigger da
 * migration `20261125000000`), e de fato só mudou o que
 * `resolveProfileFrame` recebe.
 *
 * Módulo puro (sem I/O, sem `server-only`): Client Components, repositórios e
 * a loja importam o mesmo arquivo.
 */

import { isVipActive } from "@/lib/account-tier"

/**
 * De onde a moldura vem. Decide o que a loja mostra como ação:
 *
 * - `cosmetic` — item da Central de Aura, comprável com Aura e equipável.
 * - `vip`      — exclusiva da assinatura. Não compra com Aura: a loja mostra
 *                "Virar VIP" e marca como incomprável. É posse concedida ao
 *                assinar e equipável como qualquer outra, mas a EXIBIÇÃO
 *                expira junto da assinatura — ver `isFrameEntitled`.
 * - `rank`     — concedida pela posição no ranking histórico. Não se compra
 *                nem se equipa: aparece sozinha enquanto o lugar durar.
 * - `founder`  — concedida por ter assinado o VIP dentro da janela de
 *                lançamento (ver `VIP_FOUNDER_DEADLINE`). Fechada a janela,
 *                não há mais como obtê-la: a loja mostra "Encerrada".
 * - `streak`   — concedida por ATINGIR um marco de ofensiva (1/10/25/50
 *                dias). Não se compra, e é permanente: quem chegou ao marco
 *                chegou, ainda que a ofensiva quebre depois.
 */
export type ProfileFrameSource = "cosmetic" | "vip" | "rank" | "founder" | "streak"

/**
 * Como a moldura é desenhada. `asset` é o PNG transparente que o admin sobe;
 * `ring` é arte de código (anel em gradiente + brilho), que é como rank e VIP
 * funcionam — não há asset para eles e nem deveria haver, a cor precisa
 * responder ao tema.
 */
/** Intensidade do halo externo do anel. `none` = só a borda. */
export type ProfileFrameRingGlow = "none" | "soft" | "strong"

export type ProfileFrameRender =
  | { kind: "asset"; url: string }
  | {
      kind: "ring"
      /** Cor dominante do anel (borda, brilho). */
      accent: string
      /** Segunda cor — o anel é um gradiente entre as duas. */
      accent2: string
      /** Brilho externo. `none` = só a borda, sem halo. */
      glow: ProfileFrameRingGlow
    }

/**
 * Emblema ancorado na moldura. O rank usa `flame` no meio-baixo (pedido do
 * ranking de Aura: 1º vermelho com fogo, 2º laranja, 3º amarelo, sempre com o
 * fogo embaixo); o VIP mantém a coroa que já existia; a ofensiva usa o mesmo
 * `bird` da badge de `StreakBadge`, para ser lida como a mesma coisa.
 */
export type ProfileFrameBadge = {
  icon: "flame" | "crown" | "sparkles" | "bird" | "users" | "activity" | "star"
  /**
   * Texto ao lado do símbolo. Só a foto grande do perfil o exibe (`showText`
   * em `ProfileAvatar`): num avatar de 32px não cabe, e nas listas o nome já
   * vem acompanhado do selo de tier.
   */
  text?: string
  /**
   * **Não existe escolha de canto.** O emblema fica sempre centralizado na
   * base da foto (`ProfileAvatar`). Cada moldura escolhendo o seu canto foi o
   * que fez a mesma pessoa aparecer com a estrela embaixo numa tela e à
   * direita na outra — e um emblema de canto cobria o rosto nos avatares
   * pequenos.
   */
  /** Cor do símbolo. */
  color: string
  /** Fundo da pastilha atrás do símbolo. `null` = símbolo solto, sem pastilha. */
  background: string | null
  /** Texto do `title`/`aria-label` — é a única pista para quem usa leitor de tela. */
  label: string
}

export type ProfileFrame = {
  /** Chave estável. Para `cosmetic` é o `slug` de `aura_items`. */
  slug: string
  name: string
  description: string
  source: ProfileFrameSource
  render: ProfileFrameRender
  badge: ProfileFrameBadge | null
}

/* -------------------------------------------------------------------------
 * Molduras de rank
 * ---------------------------------------------------------------------- */

/**
 * Rankings que TERÃO moldura. Cada um tem sua própria família de cores,
 * para que "1º lugar" não seja sempre o mesmo dourado: quem olha um avatar
 * precisa saber em QUE ranking a pessoa é primeira.
 *
 * Nada aqui é concedido automaticamente: `resolveProfileFrame` não olha
 * colocação. Esta lista alimenta só a vitrine da loja, como prévia do que vem.
 *
 * **Ofensiva ficou de fora de propósito, e continua fora.** É um placar raso:
 * com a base atual o 2º e o 3º lugar têm ZERO dia de ofensiva, então a
 * "moldura de pódio" iria para quem não fez nada. Ela é premiada por MARCO
 * (`STREAK_FRAMES`, abaixo), que não tem esse problema — não há disputa a
 * ganhar, só um número a alcançar. Se um dia o placar tiver disputa real e
 * `"streak"` voltar aqui, use paleta e símbolo próprios — NÃO fogo nem a
 * rampa quente, que são de Aura (as duas já saíram idênticas uma vez), e nem
 * o turquesa/pássaro, que agora são dos marcos.
 */
export const FRAME_RANK_BOARDS = ["aura", "followers", "activity"] as const
export type FrameRankBoard = (typeof FRAME_RANK_BOARDS)[number]

/** Só os três primeiros lugares recebem moldura. */
export const FRAME_RANK_PLACES = [1, 2, 3] as const
export type FrameRankPlace = (typeof FRAME_RANK_PLACES)[number]

type RankBoardArt = {
  label: string
  /** Emblema do meio-baixo, igual para os três lugares do mesmo ranking. */
  badgeIcon: ProfileFrameBadge["icon"]
  /**
   * Uma paleta por lugar, do mais quente/intenso (1º) ao mais frio (3º).
   * Cada entrada é `[accent, accent2]` — o anel é o gradiente entre as duas.
   */
  places: Record<FrameRankPlace, { accent: string; accent2: string; label: string }>
}

/**
 * A arte de cada ranking.
 *
 * A escala de Aura é a da especificação: **1º vermelho, 2º laranja, 3º
 * amarelo**, sempre com o fogo no meio-baixo. Os outros rankings seguem o
 * MESMO padrão (mais intenso → mais claro dentro de uma família só) trocando
 * a família de cor e o símbolo, para que dois primeiros lugares de rankings
 * diferentes nunca se confundam.
 */
const RANK_BOARD_ART: Record<FrameRankBoard, RankBoardArt> = {
  aura: {
    label: "Aura",
    badgeIcon: "flame",
    places: {
      1: { accent: "oklch(0.58 0.25 25)", accent2: "oklch(0.70 0.22 30)", label: "Vermelho" },
      2: { accent: "oklch(0.70 0.19 55)", accent2: "oklch(0.80 0.16 62)", label: "Laranja" },
      3: { accent: "oklch(0.85 0.17 95)", accent2: "oklch(0.92 0.14 100)", label: "Amarelo" },
    },
  },
  followers: {
    label: "Seguidores",
    badgeIcon: "users",
    places: {
      1: { accent: "oklch(0.50 0.26 300)", accent2: "oklch(0.66 0.23 310)", label: "Violeta" },
      2: { accent: "oklch(0.64 0.19 292)", accent2: "oklch(0.77 0.15 300)", label: "Lilás" },
      3: { accent: "oklch(0.80 0.12 295)", accent2: "oklch(0.88 0.09 300)", label: "Lavanda" },
    },
  },
  activity: {
    label: "Atividade",
    badgeIcon: "activity",
    places: {
      1: { accent: "oklch(0.55 0.20 158)", accent2: "oklch(0.70 0.18 150)", label: "Esmeralda" },
      2: { accent: "oklch(0.70 0.15 163)", accent2: "oklch(0.80 0.13 156)", label: "Verde" },
      3: { accent: "oklch(0.84 0.11 168)", accent2: "oklch(0.90 0.09 162)", label: "Menta" },
    },
  },
}

const RANK_PLACE_ORDINAL: Record<FrameRankPlace, string> = { 1: "1º", 2: "2º", 3: "3º" }

/** Slug determinístico da moldura de rank — `rank:aura:1`. */
export function rankFrameSlug(board: FrameRankBoard, place: FrameRankPlace): string {
  return `rank:${board}:${place}`
}

/**
 * Monta a moldura de um lugar no ranking.
 *
 * O 1º lugar ganha halo forte, o 2º halo suave e o 3º só a borda: sem essa
 * gradação os três viram o mesmo anel colorido de longe.
 */
export function rankFrame(board: FrameRankBoard, place: FrameRankPlace): ProfileFrame {
  const art = RANK_BOARD_ART[board]
  const palette = art.places[place]
  const ordinal = RANK_PLACE_ORDINAL[place]

  return {
    slug: rankFrameSlug(board, place),
    name: `${ordinal} em ${art.label}`,
    description: `Concedida a quem está em ${ordinal} lugar no ranking de ${art.label.toLowerCase()} de todos os tempos.`,
    source: "rank",
    render: {
      kind: "ring",
      accent: palette.accent,
      accent2: palette.accent2,
      glow: place === 1 ? "strong" : place === 2 ? "soft" : "none",
    },
    badge: {
      icon: art.badgeIcon,
      color: palette.accent2,
      background: "var(--background)",
      label: `${ordinal} lugar — ${art.label}`,
    },
  }
}

/**
 * Todas as molduras de rank. **Concedidas de verdade** desde a migration
 * `20261123000000`.
 *
 * O modelo é POSSE PERMANENTE, all-time: entrar no top 3 de um placar
 * concede a moldura para sempre, e sair do pódio NÃO a tira. Quem concede é
 * o cron `/api/cron/rank-frames` (ranking não tem evento onde pendurar um
 * trigger: a colocação muda por atividade de terceiros, não por um ato da
 * pessoa).
 *
 * `resolveProfileFrame` continua sem receber colocação, e isso agora é ainda
 * mais deliberado: o direito é a linha em `user_aura_items`, então a moldura
 * só aparece no avatar se a pessoa a EQUIPAR — nunca por precedência
 * automática. Ver `isFrameEntitled`.
 *
 * `rank:streak:*` fica de fora de `FRAME_RANK_BOARDS` e continua inerte: o
 * placar de ofensiva é raso (2º e 3º com zero dia).
 */
export const RANK_FRAMES: ProfileFrame[] = FRAME_RANK_BOARDS.flatMap((board) =>
  FRAME_RANK_PLACES.map((place) => rankFrame(board, place))
)

/* -------------------------------------------------------------------------
 * Molduras de Ofensiva (marcos de dias)
 * ---------------------------------------------------------------------- */

/**
 * Marcos de ofensiva que dão moldura, do primeiro dia ao mais raro.
 *
 * **Marco, e não colocação.** Ofensiva é o único placar do site que não
 * serve para pódio: o 2º e o 3º lugar têm ZERO dia (ver o comentário de
 * `FRAME_RANK_BOARDS`, que a deixou de fora de propósito). Premiar por
 * MARCO conserta isso na raiz — não há disputa a ganhar, só um número a
 * alcançar, então a moldura diz exatamente a mesma coisa para todo mundo
 * que a tem, e duas pessoas com 50 dias exibem a mesma honraria em vez de
 * uma delas ficar sem porque chegou depois.
 *
 * **É posse PERMANENTE, medida por `longest_streak`.** Quem chegou aos 50
 * dias fez os 50 dias; perder a sequência depois não desfaz isso. Medir por
 * `current_streak` faria a moldura sumir do avatar no dia em que a pessoa
 * ficasse doente — punição desproporcional, e o oposto do que uma conquista
 * significa. A regra é a mesma do Fundador: conceder é irreversível, o que
 * muda é só o que a pessoa escolhe EQUIPAR.
 */
export const FRAME_STREAK_MILESTONES = [1, 10, 25, 50] as const
export type FrameStreakMilestone = (typeof FRAME_STREAK_MILESTONES)[number]

type StreakMilestoneArt = {
  name: string
  /** Frase curta do que a pessoa fez — entra na descrição e no `label`. */
  feat: string
  accent: string
  accent2: string
  glow: ProfileFrameRingGlow
  /** Texto ao lado do pássaro na foto grande do perfil. */
  badgeText: string
}

/**
 * A arte de cada marco.
 *
 * **Turquesa → ciano, e o pássaro.** O símbolo é o MESMO da badge de
 * ofensiva que já existe no site (`components/profile/StreakBadge.tsx`), para
 * que a moldura seja lida como "aquilo ali, conquistado" e não como um
 * quarto ícone novo. A COR, porém, não acompanha a badge: aquela é uma rampa
 * âmbar→vermelha, que é exatamente a de Aura — foi assim que Ofensiva já
 * saiu idêntica a Aura uma vez e ninguém sabia de qual placar a moldura era.
 * A família fria é só desta honraria: Aura é quente, Seguidores é violeta,
 * Atividade é verde, Fundador é âmbar e VIP é magenta.
 *
 * Dentro da família, o marco sobe de intensidade: 1 dia é um anel discreto
 * sem halo, e 50 dias acende forte. Sem essa gradação os quatro viram o
 * mesmo anel azul de longe, e o marco — que é a única coisa que a moldura
 * comunica — se perde.
 */
const STREAK_MILESTONE_ART: Record<FrameStreakMilestone, StreakMilestoneArt> = {
  1: {
    name: "Ofensiva",
    feat: "manteve uma ofensiva por 1 dia",
    accent: "oklch(0.72 0.09 210)",
    accent2: "oklch(0.84 0.07 205)",
    glow: "none",
    badgeText: "Ofensiva",
  },
  10: {
    name: "Ofensiva de 10",
    feat: "manteve uma ofensiva por 10 dias seguidos",
    accent: "oklch(0.66 0.13 205)",
    accent2: "oklch(0.80 0.11 198)",
    glow: "none",
    badgeText: "10 dias",
  },
  25: {
    name: "Ofensiva de 25",
    feat: "manteve uma ofensiva por 25 dias seguidos",
    accent: "oklch(0.60 0.16 198)",
    accent2: "oklch(0.75 0.14 190)",
    glow: "soft",
    badgeText: "25 dias",
  },
  50: {
    name: "Ofensiva de 50",
    feat: "manteve uma ofensiva por 50 dias seguidos",
    accent: "oklch(0.54 0.18 192)",
    accent2: "oklch(0.78 0.16 182)",
    glow: "strong",
    badgeText: "50 dias",
  },
}

/** Slug determinístico da moldura de marco — `streak:10`. */
export function streakFrameSlug(milestone: FrameStreakMilestone): string {
  return `streak:${milestone}`
}

/** Monta a moldura de um marco de ofensiva. */
export function streakFrame(milestone: FrameStreakMilestone): ProfileFrame {
  const art = STREAK_MILESTONE_ART[milestone]

  return {
    slug: streakFrameSlug(milestone),
    name: art.name,
    description: `Concedida a quem ${art.feat} completando as missões diárias. Fica com você para sempre, mesmo que a ofensiva acabe.`,
    source: "streak",
    render: {
      kind: "ring",
      accent: art.accent,
      accent2: art.accent2,
      glow: art.glow,
    },
    badge: {
      icon: "bird",
      text: art.badgeText,
      color: art.accent2,
      background: "var(--background)",
      label: `Ofensiva — ${art.feat}`,
    },
  }
}

/**
 * As quatro molduras de ofensiva, do marco mais fácil ao mais raro.
 *
 * Diferente de `RANK_FRAMES`, estas são CONCEDIDAS de verdade: o trigger de
 * `user_streaks` (migration `20261120000000`) insere a posse em
 * `user_aura_items` assim que o marco é batido, e o backfill da mesma
 * migration cobre quem já tinha chegado lá antes.
 */
export const STREAK_FRAMES: ProfileFrame[] = FRAME_STREAK_MILESTONES.map(streakFrame)

/** O maior marco que `longestStreak` alcança, ou `null` abaixo do primeiro. */
export function highestStreakMilestone(longestStreak: number): FrameStreakMilestone | null {
  let reached: FrameStreakMilestone | null = null
  for (const milestone of FRAME_STREAK_MILESTONES) {
    if (longestStreak >= milestone) reached = milestone
  }
  return reached
}

/**
 * A melhor moldura de ofensiva que `longestStreak` dá direito, ou `null`.
 *
 * **Não é mais fallback de precedência.** `resolveProfileFrame` não a chama:
 * marco de ofensiva só aparece no avatar quando EQUIPADO (ver a nota lá).
 * Fica como helper de catálogo — para telas que precisem dizer "a mais alta
 * que você alcançou" sem recompor a varredura de marcos. A posse de verdade
 * mora em `user_aura_items`, e quem a lê pronta é `getFrameCollection`.
 */
export function streakFrameFor(longestStreak: number): ProfileFrame | null {
  const milestone = highestStreakMilestone(longestStreak)
  return milestone === null ? null : streakFrame(milestone)
}

/* -------------------------------------------------------------------------
 * Moldura de VIP
 * ---------------------------------------------------------------------- */

/**
 * A moldura da assinatura. É a antiga borda dourada + coroa que cada
 * componente desenhava à mão; agora é um item de catálogo como os outros,
 * só que `source: "vip"` (a loja mostra "Virar VIP" em vez de preço).
 */
export const VIP_FRAME: ProfileFrame = {
  slug: "vip",
  name: "Moldura VIP",
  description: "Exclusiva de quem assina o VIP. Acompanha a assinatura — não se compra com Aura.",
  source: "vip",
  render: {
    kind: "ring",
    accent: "var(--vip-accent)",
    accent2: "var(--vip-accent)",
    glow: "soft",
  },
  badge: {
    icon: "crown",
    text: "VIP",
    color: "#000",
    background: "var(--vip-accent)",
    label: "Assinante VIP",
  },
}

/* -------------------------------------------------------------------------
 * Moldura de Fundador (janela de lançamento do VIP)
 * ---------------------------------------------------------------------- */

/**
 * Fim da janela de Fundador — **instante exclusivo**: quem vira VIP ANTES
 * disso ganha a moldura, quem vira depois não ganha mais, e ela nunca volta.
 *
 * Gravado como UTC explícito do fuso de Brasília (`-03:00`), e não como
 * `new Date("2026-10-01")`: a data solta é interpretada como meia-noite UTC,
 * o que encerraria a promoção às 21h do dia 30 para quem está no Brasil — três
 * horas de assinantes pagantes ficando de fora sem explicação.
 *
 * **A janela aqui é só a da interface.** Quem de fato concede é o banco
 * (`grant_vip_founder_frame`, migration `20261118000000`), que compara com a
 * MESMA data: se um cliente adiantar o relógio, a tela mente mas a posse não
 * sai. Mudar um lado sem o outro faz a loja prometer o que o banco recusa.
 */
export const VIP_FOUNDER_DEADLINE = new Date("2026-10-01T00:00:00-03:00")

/** Rótulo da janela para a interface ("até 1º de outubro"). */
export const VIP_FOUNDER_DEADLINE_LABEL = "1º de outubro de 2026"

/** Se a janela de Fundador ainda está aberta no instante `now`. */
export function isVipFounderWindowOpen(now: Date = new Date()): boolean {
  return now.getTime() < VIP_FOUNDER_DEADLINE.getTime()
}

/**
 * A moldura de quem assinou o VIP na janela de lançamento.
 *
 * **Âmbar + estrela, e não o magenta do VIP.** Ela precisa se distinguir da
 * moldura de VIP comum a um olhar de distância — se as duas fossem magenta
 * com coroa, "fundador" viraria um detalhe invisível e a janela não seria
 * incentivo nenhum. Também não repete o fogo/rampa quente de Aura nem as
 * paletas de rank (ver `RANK_BOARD_ART`): cada honraria tem cor E símbolo
 * próprios, que é a regra que impediu Ofensiva de sair idêntica a Aura.
 *
 * Halo `strong`: é a moldura mais rara do site (impossível de obter depois da
 * janela), então acende mais que o VIP comum, que usa `soft`.
 */
export const VIP_FOUNDER_FRAME: ProfileFrame = {
  slug: "vip:founder",
  name: "Moldura Fundador",
  description: `Exclusiva de quem assinou o VIP até ${VIP_FOUNDER_DEADLINE_LABEL}. Encerrada a janela, não volta a ser concedida — e fica com você mesmo que a assinatura acabe.`,
  source: "founder",
  render: {
    kind: "ring",
    accent: "oklch(0.68 0.16 62)",
    accent2: "oklch(0.88 0.14 90)",
    glow: "strong",
  },
  badge: {
    icon: "star",
    text: "Fundador",
    color: "#3b2400",
    background: "oklch(0.86 0.15 88)",
    label: "Fundador — assinou o VIP na janela de lançamento",
  },
}

/* -------------------------------------------------------------------------
 * Molduras cosméticas (Central de Aura)
 * ---------------------------------------------------------------------- */

/**
 * Transforma um item `kind='avatar_frame'` do banco em moldura.
 *
 * Devolve `null` quando o item não tem asset: item sem PNG não tem o que
 * desenhar, e um anel genérico no lugar mentiria sobre o que a pessoa comprou.
 */
export function cosmeticFrame(item: {
  slug: string
  name: string
  description: string | null
  frameAssetUrl: string | null
}): ProfileFrame | null {
  if (!item.frameAssetUrl) return null
  return {
    slug: item.slug,
    name: item.name,
    description: item.description ?? "Moldura cosmética da Central de Aura.",
    source: "cosmetic",
    render: { kind: "asset", url: item.frameAssetUrl },
    badge: null,
  }
}

/* -------------------------------------------------------------------------
 * Resolução
 * ---------------------------------------------------------------------- */

/**
 * Molduras cuja ARTE mora no código (não têm asset), indexadas pelo slug.
 *
 * Existe porque `equipped_avatar_frame_url` sozinho não basta para decidir o
 * que desenhar: uma moldura de anel não tem PNG, então equipar a de Fundador
 * gravava o slot no banco e o avatar continuava sem moldura nenhuma — o item
 * sumia da tela depois de comprado. A resolução passa a olhar o SLUG antes da
 * URL; o asset é o caminho das cosméticas que o admin sobe.
 */
const CODE_ART_FRAMES: Record<string, ProfileFrame> = {
  [VIP_FOUNDER_FRAME.slug]: VIP_FOUNDER_FRAME,
  [VIP_FRAME.slug]: VIP_FRAME,
  // As quatro de ofensiva. Registrar aqui não é detalhe: sem isto, equipar
  // uma delas gravaria o slot no banco e o avatar continuaria sem moldura
  // (elas não têm PNG), que foi exatamente o bug da de Fundador.
  ...Object.fromEntries(STREAK_FRAMES.map((frame) => [frame.slug, frame])),
  // As de ranking, pelo mesmo motivo: são anéis de código, sem asset.
  ...Object.fromEntries(RANK_FRAMES.map((frame) => [frame.slug, frame])),
}

/** A moldura de código com este slug, se houver (`null` para cosmética de asset). */
export function codeArtFrame(slug: string | null | undefined): ProfileFrame | null {
  if (!slug) return null
  return CODE_ART_FRAMES[slug] ?? null
}

/**
 * Molduras de RANK indexadas por slug — só para remontar a arte a partir de
 * um slug que veio de fora (JSON da coleção). Fora de `CODE_ART_FRAMES` de
 * propósito: aquele mapa é o que `resolveProfileFrame` aceita EQUIPAR, e
 * moldura de rank não se equipa nem se concede (ver `RANK_FRAMES`). Juntar os
 * dois faria um POST com slug de rank pintar um avatar de 1º lugar.
 */
const RANK_FRAMES_BY_SLUG: Record<string, ProfileFrame> = Object.fromEntries(
  RANK_FRAMES.map((frame) => [frame.slug, frame])
)

/**
 * Remonta a moldura a partir do que a API mandou: o SLUG, mais a URL do asset
 * quando é cosmética.
 *
 * Existe porque a arte NÃO viaja pela rede — ela mora aqui, e o JSON carrega
 * só a identidade (mesmo modelo de `lib/mini-profile-backgrounds.ts`).
 * Mandar cor, brilho e emblema pelo corpo criaria uma segunda fonte para o
 * mesmo desenho, e as duas divergiriam no primeiro ajuste de paleta.
 *
 * `null` quando o slug não tem arte conhecida — item novo no banco sem arte
 * no código degrada para "sem moldura", nunca para tela quebrada.
 */
export function frameFromWire(slug: string, assetUrl: string | null): ProfileFrame | null {
  const codeArt = codeArtFrame(slug) ?? RANK_FRAMES_BY_SLUG[slug]
  if (codeArt) return codeArt
  if (!assetUrl) return null
  return {
    slug,
    name: "Moldura",
    description: "Moldura cosmética da Central de Aura.",
    source: "cosmetic",
    render: { kind: "asset", url: assetUrl },
    badge: null,
  }
}

/**
 * Se a pessoa tem DIREITO de exibir esta moldura agora.
 *
 * Só as de arte em código passam por aqui, porque só elas representam um
 * status que pode expirar: a de VIP exige assinatura ativa; a de Fundador,
 * não (é permanente por definição). Uma cosmética comprada não tem
 * condição — quem pagou, exibe.
 */
function isFrameEntitled(frame: ProfileFrame, context: FrameContext): boolean {
  if (frame.source === "vip") return Boolean(context.isVip)
  if (frame.source === "founder") return Boolean(context.isFounder)
  // Marco de ofensiva: o direito é o RECORDE (`longest_streak`), nunca a
  // ofensiva de hoje. Conferir contra a atual tiraria a moldura do avatar no
  // primeiro dia perdido — e um marco alcançado não se desfaz.
  if (frame.source === "streak") {
    const milestone = Number(frame.slug.split(":")[1])
    return (context.longestStreak ?? 0) >= milestone
  }
  // Moldura de ranking: o direito é a POSSE (a linha em `user_aura_items`
  // que o cron concedeu ao ver a pessoa no top 3), nunca a colocação de
  // agora. Conferir a posição aqui desfaria a regra central da feature —
  // entrar no pódio concede para sempre, sair não tira — e o avatar de quem
  // caiu para 4º perderia sozinho a moldura que ele escolheu exibir.
  // `resolveProfileFrame` nem recebe colocação, de propósito.
  return true
}

/**
 * A identidade de moldura de uma pessoa, em UM objeto.
 *
 * POR QUE ISTO É UM TIPO, E NÃO TRÊS PROPS SOLTAS
 * -----------------------------------------------
 * Cada casca de avatar (`PersonAvatar`, `AuthorLink`, `UserAvatar`) nasceu
 * com um `frameUrl?: string | null` opcional e mais nada. O resultado: as
 * telas de fórum, comentários, ranking, pódio, notícia e admin simplesmente
 * NÃO passavam nada — quem comprava uma moldura não a via em lugar nenhum
 * fora do próprio perfil, e cada tela nova repetia o esquecimento porque a
 * prop era opcional e o TypeScript não reclamava.
 *
 * Com um tipo só, a moldura viaja como unidade: quem monta o resumo de um
 * perfil preenche `profileFrameOf(...)` uma vez e toda casca recebe o mesmo
 * objeto. Não há como levar metade (a URL sem o slug, o slug sem a posse) —
 * que era exatamente como uma moldura de arte em código sumia da tela.
 *
 * Os três campos são o mínimo para decidir, e nenhum deles é derivável dos
 * outros: `isVip` expira, `isFounder` não, e `slug`/`url` dizem o que a
 * pessoa ESCOLHEU exibir.
 */
export type ProfileFrameIdentity = {
  /** Slug do item equipado (`equipped_avatar_frame_slug`). */
  slug: string | null
  /** Asset do item equipado (`equipped_avatar_frame_url`), quando ele tem um. */
  url: string | null
  /** VIP ativo AGORA. */
  isVip: boolean
  /** Possui a Moldura de Fundador (permanente). */
  isFounder: boolean
  /**
   * RECORDE de ofensiva (`user_streaks.longest_streak`), que decide os marcos
   * alcançados — nunca `current_streak`. Ver `isFrameEntitled`.
   *
   * `0` quando a tela não tem o dado: a moldura some do avatar, mas nenhuma
   * tela quebra. É a mesma degradação suave de "item sem arte".
   */
  longestStreak: number
  /**
   * O dono escolheu não exibir moldura nenhuma. Campo OBRIGATÓRIO, pelo mesmo
   * motivo de `isFounder`: como opcional, cada enriquecimento novo esqueceria
   * de trazê-lo e o avatar voltaria a mostrar a honraria de quem pediu para
   * não mostrar nada.
   */
  frameOptOut: boolean
}

/**
 * Monta a identidade de moldura a partir de uma linha de perfil.
 *
 * Aceita as duas convenções de nome que convivem no código — `snake_case`
 * das linhas do banco e `camelCase` do payload de sessão — para que nenhuma
 * tela precise traduzir campo a campo na mão (foi assim que um `frameSlug`
 * ficou para trás em metade das chamadas).
 */
export function profileFrameOf(source: {
  equipped_avatar_frame_slug?: string | null
  equipped_avatar_frame_url?: string | null
  equippedFrameSlug?: string | null
  equippedFrameUrl?: string | null
  account_tier?: string | null
  accountTier?: string | null
  vip_expires_at?: string | null
  vipExpiresAt?: string | null
  is_founder?: boolean | null
  isFounder?: boolean | null
  longest_streak?: number | null
  longestStreak?: number | null
  avatar_frame_opt_out?: boolean | null
  frameOptOut?: boolean | null
}): ProfileFrameIdentity {
  const tier = source.account_tier ?? source.accountTier ?? null
  const expiresAt = source.vip_expires_at ?? source.vipExpiresAt ?? null

  return {
    slug: source.equipped_avatar_frame_slug ?? source.equippedFrameSlug ?? null,
    url: source.equipped_avatar_frame_url ?? source.equippedFrameUrl ?? null,
    isVip: isVipActive(tier, expiresAt),
    isFounder: Boolean(source.is_founder ?? source.isFounder),
    longestStreak: source.longest_streak ?? source.longestStreak ?? 0,
    frameOptOut: Boolean(source.avatar_frame_opt_out ?? source.frameOptOut),
  }
}

/** O que se sabe sobre uma pessoa na hora de escolher a moldura dela. */
export type FrameContext = {
  /** URL do asset da moldura cosmética equipada (`equipped_avatar_frame_url`). */
  equippedFrameUrl?: string | null
  /** Slug do item equipado, quando conhecido — identifica molduras sem asset. */
  equippedFrameSlug?: string | null
  /** VIP ativo AGORA (já passado por `isVipActive`) — não o `account_tier` cru. */
  isVip?: boolean
  /**
   * Se a pessoa POSSUI a moldura de Fundador (linha em `user_aura_items`).
   * Independe de VIP ativo: quem assinou na janela mantém o selo mesmo depois
   * de cancelar — é o que "fundador" significa.
   */
  isFounder?: boolean
  /**
   * RECORDE de ofensiva (`user_streaks.longest_streak`) — o maior número de
   * dias seguidos que a pessoa já completou, não a sequência viva de hoje.
   * Decide quais marcos de `STREAK_FRAMES` ela tem direito de exibir.
   */
  longestStreak?: number
  /**
   * O dono escolheu NÃO exibir moldura nenhuma
   * (`user_profiles.avatar_frame_opt_out`).
   *
   * Existe porque slot vazio significava duas coisas: "nunca escolhi" e
   * "escolhi nenhuma". Como o fallback de honraria desenha a moldura de
   * Fundador/VIP/Ofensiva justamente quando o slot está vazio, clicar em
   * "Nenhuma" gravava `null`, a rota respondia ok e o avatar continuava com a
   * moldura no site inteiro — o botão parecia quebrado.
   */
  frameOptOut?: boolean
}

/**
 * A moldura que a pessoa exibe, em ordem de precedência:
 *
 * 1. **Equipada** — escolha explícita do dono ganha de tudo. Vale tanto para
 *    a cosmética de asset quanto para uma moldura de arte em código
 *    (`CODE_ART_FRAMES`), como a de Fundador.
 * 2. **Fundador** — honraria permanente de quem assinou na janela de
 *    lançamento, acima do VIP comum: é a mais rara das duas, e quem a tem
 *    quase sempre também é VIP, então abaixo ela nunca apareceria.
 * 3. **VIP** — a base de quem assina.
 *
 * `null` = avatar sem moldura, só a borda neutra padrão.
 *
 * **O passo 3 é COMPATIBILIDADE, não o caminho principal.** Desde a migration
 * `20261125000000` a moldura de VIP é posse de verdade em `user_aura_items`,
 * e o trigger a EQUIPA para quem vira assinante com o slot vazio — o
 * assinante novo chega aqui pelo passo 1, como todo mundo. O fallback existe
 * pelos assinantes ANTERIORES à migration: eles receberam a posse no
 * backfill, mas não foram equipados (mexer no slot de milhares de perfis para
 * um efeito visual nulo não se justificava). Sem ele, todos perderiam o anel
 * no dia do deploy.
 *
 * Quem equipa outra moldura sai do fallback e agora consegue VOLTAR para a de
 * VIP pelo seletor — o que faltava antes: sem posse, ela era a única moldura
 * que a pessoa não podia escolher de novo depois de trocar.
 *
 * **Ofensiva NÃO entra no fallback — é só posse.** O fallback existe para a
 * honraria de ASSINATURA (Fundador/VIP), que é o sinal que o site quer dar
 * sozinho enquanto o seletor de moldura não é usado por todo mundo. Os
 * marcos de ofensiva são concedidos para a pessoa PODER equipar, não para o
 * sistema equipar por ela: como o marco mais baixo é 1 dia, qualquer membro
 * que completou as missões um único dia aparecia emoldurado no site inteiro
 * sem nunca ter escolhido nada — e com a pílula "Sem ofensiva" ao lado, já
 * que o direito sai de `longest_streak` e a sequência viva era 0.
 *
 * Quem quiser exibir a de ofensiva a EQUIPA, e aí ela ganha de tudo pelo
 * passo 1. A posse continua sendo calculada normalmente em
 * `getFrameCollection` (via `highestStreakMilestone`), que é o que alimenta
 * o `ProfileFramePicker` — cortar o fallback não tira a moldura de ninguém,
 * só para de forçá-la no avatar.
 *
 * **Moldura de rank NÃO entra aqui.** Nada é concedido automaticamente por
 * colocação: enquanto o sistema de equipar não estiver lançado, um avatar só
 * mostra o que o dono escolheu (ou a honraria dele). As molduras de rank
 * existem como catálogo (`RANK_FRAMES`) só para a vitrine da loja — ver o
 * comentário de `RANK_FRAMES`.
 */
export function resolveProfileFrame(context: FrameContext): ProfileFrame | null {
  // Slug primeiro: uma moldura de anel não tem URL, então checar a URL antes
  // faria a equipada de Fundador cair no `isVip` e virar a moldura de VIP.
  //
  // A equipada ainda precisa PASSAR pelo direito que ela representa: equipar
  // é só a escolha de qual exibir, nunca a fonte do direito. Sem esta
  // checagem, uma linha de posse do item `vip` (concedida um dia por engano,
  // por brinde ou por conversão de item) pintaria o anel de assinante em
  // quem não assina — a moldura viraria o próprio privilégio.
  const equippedCodeArt = codeArtFrame(context.equippedFrameSlug)
  if (equippedCodeArt && isFrameEntitled(equippedCodeArt, context)) {
    return equippedCodeArt
  }

  if (context.equippedFrameUrl) {
    return {
      slug: context.equippedFrameSlug ?? "equipped",
      name: "Moldura equipada",
      description: "Moldura cosmética equipada pelo dono do perfil.",
      source: "cosmetic",
      render: { kind: "asset", url: context.equippedFrameUrl },
      badge: null,
    }
  }

  // O opt-out corta SÓ o fallback de honraria, e por isso vem aqui embaixo e
  // não no topo: se a pessoa equipar uma moldura depois de ter optado por
  // nenhuma, a escolha explícita dela (os dois ramos acima) continua ganhando.
  // O trigger `trg_clear_frame_opt_out` limpa a flag nesse caso, mas a ordem
  // aqui garante o mesmo resultado mesmo que a flag fique para trás.
  if (context.frameOptOut) return null

  if (context.isFounder) return VIP_FOUNDER_FRAME
  if (context.isVip) return VIP_FRAME
  return null
}
