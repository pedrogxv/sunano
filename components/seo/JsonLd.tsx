import { SITE_URL, absoluteUrl } from "@/lib/site-url"

/**
 * Blocos de JSON-LD reutilizáveis.
 *
 * Antes só a loja, a ficha de periférico e o post do fórum emitiam schema, e
 * cada um montava o objeto na mão dentro da própria página. As duas
 * consequências: blog, notícias e listagens não emitiam nada (nenhum resultado
 * rico possível), e o `BreadcrumbList` só existia na loja — o Google mostrava
 * a URL crua no lugar da trilha em todas as outras seções.
 *
 * Aqui os blocos ficam em um lugar só, já com as regras chatas resolvidas:
 * URL sempre absoluta (o Google descarta caminho relativo dentro do schema) e
 * campo opcional omitido em vez de emitido como `undefined`/`null` — schema
 * com campo vazio é marcado como inválido no Search Console.
 */

/** Serializa com escape de `<` para o JSON nunca fechar a tag `<script>`. */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  )
}

export interface BreadcrumbEntry {
  name: string
  /** Caminho interno ("/blog/x") ou URL absoluta. */
  item: string
}

/**
 * Trilha de navegação. O Google troca a URL crua do resultado pela trilha,
 * que é o mesmo caminho que o usuário percorre ao chegar na página.
 */
export function BreadcrumbJsonLd({ items }: { items: BreadcrumbEntry[] }) {
  if (items.length === 0) return null

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: entry.name,
          item: entry.item.startsWith("http") ? entry.item : absoluteUrl(entry.item),
        })),
      }}
    />
  )
}

export interface ArticleJsonLdInput {
  /**
   * `NewsArticle` habilita Top Stories e só vale para jornalismo datado;
   * `BlogPosting` é o certo para review/análise sem data de validade.
   */
  type: "NewsArticle" | "BlogPosting"
  headline: string
  description: string
  /** Caminho interno da página. */
  path: string
  image?: string | null
  datePublished: string
  dateModified?: string | null
  authorName?: string | null
}

export function ArticleJsonLd({
  type,
  headline,
  description,
  path,
  image,
  datePublished,
  dateModified,
  authorName,
}: ArticleJsonLdInput) {
  const url = absoluteUrl(path)

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": type,
        "@id": url,
        // O Google trunca `headline` acima de 110 chars e marca o item como
        // inválido — cortar aqui é melhor que perder o rich result inteiro.
        headline: headline.length > 110 ? `${headline.slice(0, 109).trimEnd()}…` : headline,
        description,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        ...(image ? { image: [new URL(image, SITE_URL).toString()] } : {}),
        datePublished,
        // Sem `dateModified` o Google assume a data de publicação e o conteúdo
        // atualizado nunca recupera frescor no ranking.
        dateModified: dateModified ?? datePublished,
        author: authorName
          ? { "@type": "Person", name: authorName }
          : { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "pt-BR",
        isAccessibleForFree: true,
      }}
    />
  )
}

export interface ItemListEntry {
  name: string
  /** Caminho interno ou URL absoluta do item. */
  url: string
}

/**
 * Marca uma listagem como coleção em vez de texto solto, e informa ao Google
 * quais URLs a página reúne — útil onde o link é renderizado no cliente e não
 * há âncora rastreável.
 */
export function ItemListJsonLd({ items, name }: { items: ItemListEntry[]; name?: string }) {
  if (items.length === 0) return null

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        ...(name ? { name } : {}),
        numberOfItems: items.length,
        itemListElement: items.map((entry, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: entry.name,
          url: entry.url.startsWith("http") ? entry.url : absoluteUrl(entry.url),
        })),
      }}
    />
  )
}

export interface VideoJsonLdEntry {
  name: string
  description: string
  thumbnailUrl?: string | null
  uploadDate?: string | null
  /** URL da página do vídeo (YouTube), usada como `embedUrl`/`contentUrl`. */
  url: string
  duration?: string | null
}

/**
 * `VideoObject` é o que coloca o vídeo na aba Vídeos do Google e habilita a
 * miniatura no resultado — sem ele a página de vídeos concorre como texto.
 */
export function VideoListJsonLd({ videos }: { videos: VideoJsonLdEntry[] }) {
  if (videos.length === 0) return null

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        numberOfItems: videos.length,
        itemListElement: videos.map((video, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "VideoObject",
            name: video.name,
            description: video.description,
            ...(video.thumbnailUrl ? { thumbnailUrl: [video.thumbnailUrl] } : {}),
            ...(video.uploadDate ? { uploadDate: video.uploadDate } : {}),
            ...(video.duration ? { duration: video.duration } : {}),
            embedUrl: video.url,
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
        })),
      }}
    />
  )
}
