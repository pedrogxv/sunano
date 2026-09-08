/**
 * Fundos de Mini Perfil — catálogo de efeitos puramente CSS.
 *
 * O `mini_banner_url` (imagem enviada pelo usuário) continua sendo o fundo
 * "de fábrica" do cartão. Um fundo COMPRADO é outra coisa: um tema animado
 * que envolve o cartão inteiro (camada de trás, borda e camada da frente),
 * desenhado só com gradiente + keyframes — nenhum asset, nenhuma lib de
 * partículas, nada que precise ir pro Storage.
 *
 * Por que o efeito mora aqui e não no banco: o catálogo (`aura_items`) guarda
 * nome, preço e posse — coisas que o admin edita. A ARTE de cada fundo é
 * código (classes CSS + camadas React), e código não é conteúdo editável. O
 * vínculo entre os dois é o `slug` do item, que este módulo mapeia para o
 * tema. Item no banco sem tema aqui = cartão sem efeito (degradação suave),
 * nunca uma tela quebrada.
 *
 * Módulo puro (sem I/O, sem `server-only`): o Client Component do cartão e os
 * repositórios importam o mesmo arquivo, mesmo padrão de `lib/aura-pricing.ts`.
 *
 * ATENÇÃO: o catálogo (`MINI_PROFILE_BG_THEMES`) está VAZIO hoje — a primeira
 * leva de fundos foi retirada da loja. Tudo aqui embaixo é a estrutura pronta
 * para a próxima leva; ver o comentário da constante.
 */

/** Faixa de preço. Quanto mais alto, mais camadas de efeito o tema acende. */
export type MiniProfileBgTier = "raro" | "epico" | "lendario"

/** Preço de tabela de cada faixa, em Aura. Fonte de verdade do seed da migration. */
export const MINI_PROFILE_BG_TIER_COST: Record<MiniProfileBgTier, number> = {
  raro: 50,
  epico: 150,
  lendario: 350,
}

export const MINI_PROFILE_BG_TIER_LABEL: Record<MiniProfileBgTier, string> = {
  raro: "Raro",
  epico: "Épico",
  lendario: "Lendário",
}

/**
 * Cor de acento da faixa — usada no selo do card da loja e no anel do
 * preview. Valores em oklch, na mesma linguagem do resto do tema.
 */
export const MINI_PROFILE_BG_TIER_ACCENT: Record<MiniProfileBgTier, string> = {
  raro: "oklch(0.72 0.15 230)",
  epico: "oklch(0.68 0.22 305)",
  lendario: "oklch(0.78 0.19 75)",
}

/**
 * Camadas que um tema pode acender. Cada uma é um `<span>` posicionado no
 * cartão, estilizado pelo CSS de `app/globals.css` (`.mpbg-*`).
 *
 * - `aurora`    — véu de gradiente que respira e desliza no fundo.
 * - `sheen`     — faixa de brilho diagonal cruzando o cartão (holográfico).
 * - `particles` — pontinhos subindo/flutuando (fagulhas, estrelas, bolhas).
 * - `scanline`  — linha horizontal varrendo, vibe CRT/tech.
 * - `bolt`      — raios que piscam em intervalos irregulares.
 * - `orbit`     — halo que gira em volta da moldura.
 * - `rays`      — leque de raios de luz saindo do centro.
 */
export type MiniProfileBgLayer =
  | "aurora"
  | "sheen"
  | "particles"
  | "scanline"
  | "bolt"
  | "orbit"
  | "rays"

/** Estilo da borda animada do cartão. */
export type MiniProfileBgBorder =
  /** Sem borda animada — só a borda estática do cartão. */
  | "none"
  /** Halo suave pulsando atrás da moldura. */
  | "glow"
  /** Traço de luz correndo pelo perímetro (conic-gradient girando). */
  | "runner"
  /** Runner + halo forte + brilho interno. O topo da linha. */
  | "prismatic"

export type MiniProfileBgTheme = {
  slug: string
  name: string
  description: string
  tier: MiniProfileBgTier
  /** Gradiente de fundo do cartão (camada mais atrás de tudo). */
  background: string
  /** Cor dominante — alimenta `--mpbg-accent` (halo, partículas, raios). */
  accent: string
  /** Segunda cor — alimenta `--mpbg-accent-2` (degradês de duas cores). */
  accent2: string
  border: MiniProfileBgBorder
  layers: MiniProfileBgLayer[]
  /** Quantidade de partículas quando a camada `particles` está ligada. */
  particleCount?: number
}

/**
 * O catálogo — **vazio de propósito**.
 *
 * A primeira leva de nove fundos foi retirada da loja em 2026-09-08 (a arte
 * não passou no crivo). A ESTRUTURA continua inteira: tipos, faixas, camadas
 * CSS (`.mpbg-*` em `app/globals.css`), rotas de equipar/desequipar, o kind
 * `mini_profile_bg` no banco e a coluna `equipped_mini_profile_bg_id`. Só a
 * arte saiu.
 *
 * Para relançar: adicione temas aqui e reative (ou insira) os itens
 * correspondentes em `aura_items` com o MESMO slug — nada mais precisa mudar.
 * Enquanto esta lista estiver vazia, a seção da Central de Aura e o seletor do
 * perfil não renderizam, porque item sem tema é ignorado em toda parte.
 */
export const MINI_PROFILE_BG_THEMES: MiniProfileBgTheme[] = []

const THEME_BY_SLUG = new Map(MINI_PROFILE_BG_THEMES.map((t) => [t.slug, t]))

/**
 * Tema de um slug do catálogo, ou `null` quando o item não tem arte aqui
 * (item novo criado pelo admin, ou slug renomeado). Quem chama sempre trata
 * `null` como "cartão sem efeito", nunca como erro.
 */
export function getMiniProfileBgTheme(slug: string | null | undefined): MiniProfileBgTheme | null {
  if (!slug) return null
  return THEME_BY_SLUG.get(slug) ?? null
}

/** Temas de uma faixa, na ordem do catálogo. */
export function miniProfileBgThemesByTier(tier: MiniProfileBgTier): MiniProfileBgTheme[] {
  return MINI_PROFILE_BG_THEMES.filter((t) => t.tier === tier)
}
