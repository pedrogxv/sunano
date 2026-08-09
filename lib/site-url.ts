const PRODUCTION_URL = "https://sunano.com.br"

function isLocalhost(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(url)
}

/**
 * URL pública do site, usada em canonical, sitemap, robots, OG e JSON-LD.
 *
 * O padrão antigo (`process.env.NEXT_PUBLIC_APP_URL ?? "https://sunano.com.br"`)
 * só protegia contra a env ausente. Em produção ela estava definida como
 * `http://localhost:3000`, então o `??` passava reto e TODA página servia
 * `<link rel="canonical" href="http://localhost:3000...">` — o Google lê isso
 * como "a versão oficial está nesse endereço", não consegue buscá-lo, e tira a
 * página do índice. O sitemap saía com o mesmo host e era descartado inteiro.
 *
 * Por isso aqui um localhost em produção é ignorado em favor do domínio real:
 * uma env errada volta a ser um detalhe de configuração, não uma queda de SEO.
 */
function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configured && !(process.env.NODE_ENV === "production" && isLocalhost(configured))) {
    // Sem barra final: todo consumidor concatena caminhos que já começam com "/".
    return configured.replace(/\/+$/, "")
  }

  // Deploys de preview na Vercel não têm domínio fixo; usar a URL do próprio
  // deploy mantém canonical/OG coerentes com onde a página está sendo servida.
  const vercelUrl = process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_URL : undefined
  if (vercelUrl) return `https://${vercelUrl}`

  return PRODUCTION_URL
}

export const SITE_URL = resolveSiteUrl()

/** Monta uma URL absoluta a partir de um caminho interno ("/blog/x"). */
export function absoluteUrl(path = "") {
  if (!path) return SITE_URL
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}
