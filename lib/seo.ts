import type { Metadata } from "next"

import { SITE_URL, absoluteUrl } from "@/lib/site-url"

/**
 * Camada única de metadata social do site.
 *
 * Antes cada página montava `openGraph`/`twitter` na mão, e três problemas se
 * repetiam (todos apontados na auditoria de preview):
 *
 * 1. **Sem og:image.** O Next NÃO faz merge de `openGraph` entre layout e
 *    página: se a página declara o objeto, ele substitui o do layout raiz por
 *    inteiro. Toda página que declarava `openGraph` sem `images` ficava sem
 *    imagem nenhuma no card.
 * 2. **Imagem no formato errado.** O fallback era `/icon.png` (512×512, 1:1).
 *    Card social quer 1200×630 (1.91:1); 512px é menor que o mínimo do
 *    Twitter/X para `summary_large_image` e aparece esticado ou recortado.
 * 3. **Título fora do orçamento.** Nem sempre truncado, então passava dos 70
 *    chars que as plataformas cortam — ou era curto demais ("Blog") e o card
 *    saía sem informação.
 *
 * `buildMetadata` resolve os três de uma vez: todo caller passa conteúdo
 * (título, descrição, imagem opcional) e recebe metadata completa e válida.
 */

/** Nome usado no sufixo dos títulos e no `og:site_name`. */
export const SITE_NAME = "Sunano"

/**
 * Orçamentos de caracteres das plataformas.
 *
 * `og:title` é cortado por volta de 60–70 chars no feed do Facebook/X/WhatsApp;
 * `og:description` some depois de ~160–200. Os mínimos não são regra de
 * plataforma, são qualidade de card: título de uma palavra e descrição de 40
 * chars passam pouca informação e reduzem o clique.
 */
export const TITLE_MAX = 60
export const TITLE_MIN = 30
export const DESCRIPTION_MAX = 160
export const DESCRIPTION_MIN = 110

/** Dimensões canônicas de um card social (proporção 1.91:1). */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/**
 * Corta sem partir palavra no meio e sem deixar pontuação órfã ("Título ,…").
 * Só recua até o último espaço se ele não estiver longe demais do limite —
 * um texto sem espaços (URL gigante) é cortado seco.
 */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean

  // -1 para abrir espaço para a reticência dentro do orçamento.
  const slice = clean.slice(0, max - 1)
  const lastSpace = slice.lastIndexOf(" ")
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice

  return `${cut.replace(/[\s,;:.\-–—]+$/, "")}…`
}

/**
 * Texto puro a partir de markdown/HTML, para descrição de card.
 *
 * O corpo de post do fórum e do blog é markdown: jogado cru no
 * `og:description` ele vaza `##`, `**`, `![img](url)` e blocos de código para
 * dentro do preview. Aqui o conteúdo vira uma linha legível.
 */
export function toPlainText(input: string | null | undefined): string {
  if (!input) return ""

  return (
    input
      // Blocos de código inteiros não descrevem nada — saem antes do resto.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      // Imagem some; link vira só o rótulo.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      // Marcadores de cabeçalho, citação, lista, ênfase e regra horizontal.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}[-*+]\s+/gm, "")
      .replace(/^\s{0,3}\d+\.\s+/gm, "")
      .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, " ")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$2")
      // Entidades comuns que sobram de conteúdo colado de outro editor.
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
  )
}

/**
 * Descrição dentro do orçamento das plataformas.
 *
 * Curta demais é uma das falhas apontadas na auditoria, e não dá para inventar
 * texto: quando o conteúdo próprio não chega ao mínimo, completamos com um
 * complemento de contexto que o caller fornece (categoria, marca, autor…),
 * mantendo a descrição verdadeira sobre a página.
 */
export function buildDescription(
  primary: string | null | undefined,
  fallback: string,
  options: { context?: string; extraContext?: string } = {}
): string {
  const base = toPlainText(primary)
  const source = base.length > 0 ? base : toPlainText(fallback)

  // Conteúdo do usuário costuma ser curtíssimo ("mouse brabo da wl", 17
  // chars). Um complemento só nem sempre chega ao mínimo, então emendamos os
  // disponíveis em ordem, parando assim que a descrição fica informativa —
  // sem nunca ultrapassar o teto nem repetir contexto desnecessário.
  const parts = [options.context, options.extraContext]
    .map((part) => toPlainText(part))
    .filter((part) => part.length > 0)

  let result = source
  for (const part of parts) {
    if (result.length >= DESCRIPTION_MIN) break
    const merged = `${result.replace(/[.\s]+$/, "")}. ${part}`
    if (merged.length > DESCRIPTION_MAX) break
    result = merged
  }

  return truncate(result, DESCRIPTION_MAX)
}

/**
 * Título dentro do orçamento, já com o sufixo da marca.
 *
 * O orçamento é aplicado ao conjunto: o sufixo é descontado primeiro e o
 * título recebe o que sobra, então "título longo + sufixo" nunca estoura os
 * 60 chars. Se o sufixo sozinho já não couber, ele é descartado — o nome da
 * página informa mais que o nome do site.
 */
export function buildTitle(title: string, options: { suffix?: string | false } = {}): string {
  const clean = toPlainText(title)
  const suffix = options.suffix === false ? "" : (options.suffix ?? ` | ${SITE_NAME}`)

  if (!suffix) return truncate(clean, TITLE_MAX)

  const budget = TITLE_MAX - suffix.length
  // Sufixo comendo o título todo: melhor ficar sem ele.
  if (budget < 20) return truncate(clean, TITLE_MAX)

  return `${truncate(clean, budget)}${suffix}`
}

/** Parâmetros aceitos pelo gerador de card (`/api/og`). */
export interface OgImageParams {
  title: string
  /** Rótulo pequeno acima do título: "Fórum", "Loja", "Blog"… */
  eyebrow?: string
  /** Linha de apoio abaixo do título. */
  subtitle?: string
  /** Imagem de conteúdo desenhada dentro do card (capa, foto do produto). */
  image?: string
  /** Formato do recorte da imagem de conteúdo. */
  variant?: "cover" | "product" | "avatar"
}

/**
 * URL do card gerado dinamicamente.
 *
 * Absoluta de propósito: crawler de rede social não resolve caminho relativo
 * de forma confiável, mesmo com `metadataBase` configurado.
 */
export function ogImageUrl(params: OgImageParams): string {
  const search = new URLSearchParams()
  search.set("title", truncate(toPlainText(params.title), 120))
  if (params.eyebrow) search.set("eyebrow", truncate(toPlainText(params.eyebrow), 40))
  if (params.subtitle) search.set("subtitle", truncate(toPlainText(params.subtitle), 120))
  if (params.image) search.set("image", params.image)
  if (params.variant) search.set("variant", params.variant)

  return `${SITE_URL}/api/og?${search.toString()}`
}

interface BuildMetadataInput {
  /** Título da página, sem sufixo de marca. */
  title: string
  /**
   * Título do card social, quando ele deve diferir do título da aba/SERP.
   *
   * As duas superfícies querem coisas diferentes: na aba e no breadcrumb,
   * "Blog" é claro porque a marca já está no template (`%s | Sunano`); solto
   * no feed do X ele vira um card de uma palavra, sem contexto — o caso
   * "og:title is too short" da auditoria. Aqui a listagem manda um título
   * descritivo pro card sem poluir a navegação.
   */
  socialTitle?: string
  /** Sufixo customizado, ou `false` para não usar nenhum. */
  titleSuffix?: string | false
  description: string
  /** Caminho interno ("/blog/x"); vira canonical e `og:url`. */
  path: string
  type?: "website" | "article" | "profile"
  /**
   * Imagem própria da página (capa do post, foto do produto). Entra desenhada
   * no card gerado — assim toda página tem imagem 1200×630 mesmo quando o
   * conteúdo original é quadrado ou pequeno demais.
   */
  image?: string | null
  imageVariant?: OgImageParams["variant"]
  /** Rótulo/subtítulo desenhados no card. */
  eyebrow?: string
  subtitle?: string
  publishedTime?: string
  modifiedTime?: string
  authors?: string[]
  /** Páginas de conteúdo privado/utilitário saem do índice. */
  noIndex?: boolean
  keywords?: string[]
}

/**
 * Monta a metadata completa de uma página.
 *
 * Sempre devolve `openGraph` e `twitter` preenchidos, com imagem 1200×630 e
 * `alt` — nunca deixa a página herdar pela metade nem cair sem card.
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const title = buildTitle(input.socialTitle ?? input.title, { suffix: input.titleSuffix })
  const description = truncate(toPlainText(input.description), DESCRIPTION_MAX)
  const url = absoluteUrl(input.path)

  const ogImage = ogImageUrl({
    title: input.socialTitle ?? input.title,
    eyebrow: input.eyebrow,
    subtitle: input.subtitle,
    image: input.image ?? undefined,
    variant: input.imageVariant,
  })

  const images = [
    {
      url: ogImage,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      // Card sem `alt` é inacessível em leitor de tela no X e no Mastodon.
      alt: title,
      type: "image/png",
    },
  ]

  return {
    title: input.titleSuffix === false ? title : input.title,
    description,
    keywords: input.keywords,
    alternates: { canonical: input.path },
    robots: input.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "pt_BR",
      type: input.type ?? "website",
      images,
      ...(input.type === "article"
        ? {
            publishedTime: input.publishedTime,
            modifiedTime: input.modifiedTime ?? input.publishedTime,
            authors: input.authors,
          }
        : {}),
    },
    twitter: {
      // Sempre `summary_large_image`: o card gerado é sempre 1200×630, então
      // nunca caímos no `summary` pequeno por falta de imagem.
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  }
}
