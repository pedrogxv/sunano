import { SITE_URL } from "@/lib/site-url"

/**
 * Classificação de um link escrito por um usuário (post do fórum, comentário,
 * descrição de produto) para decidir como exibi-lo.
 *
 * A distinção que interessa é "continua no Sunano" vs "sai do Sunano": link
 * interno vira uma pílula com o ícone da seção de destino (navegação client-side,
 * sem confirmação), link externo fica sublinhado tracejado e passa por um
 * aviso antes de abrir — o usuário só sai do site depois de dizer que quer.
 */

export type InternalSection =
  | "forum"
  | "loja"
  | "perifericos"
  | "perfil"
  | "blog"
  | "noticias"
  | "mercado"
  | "ranking"
  | "aura"
  | "tierlist"
  | "videos"
  | "conquistas"
  | "site"

export type LinkTarget =
  | { kind: "internal"; href: string; section: InternalSection; label: string }
  | { kind: "external"; href: string; hostname: string }

/**
 * Hosts tratados como "o próprio site". Além do domínio configurado
 * (`SITE_URL`, que em preview da Vercel é o host do deploy), o domínio de
 * produção fica fixo aqui: um post escrito em produção e lido num preview —
 * ou vice-versa — continua sendo link interno, sem cair no aviso de saída.
 */
const INTERNAL_HOSTNAMES = new Set(
  [safeHostname(SITE_URL), "sunano.com.br", "www.sunano.com.br"].filter(
    (host): host is string => Boolean(host)
  )
)

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Primeiro segmento do caminho ("/forum/abc" -> "forum"), em minúsculas. */
function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? ""
}

const SECTION_LABEL: Record<InternalSection, string> = {
  forum: "Fórum",
  loja: "Loja",
  perifericos: "Periféricos",
  perfil: "Perfil",
  blog: "Blog",
  noticias: "Notícias",
  mercado: "Mercado",
  ranking: "Ranking",
  aura: "Aura",
  tierlist: "Tier List",
  videos: "Vídeos",
  conquistas: "Conquistas",
  site: "Sunano",
}

/**
 * Seções que ganham rótulo/ícone próprio. Rotas fora da lista (páginas
 * institucionais, conta, checkout…) caem em "site": continuam internas, só
 * não recebem um rótulo específico.
 */
const SECTIONS: Record<string, InternalSection> = {
  forum: "forum",
  loja: "loja",
  perifericos: "perifericos",
  perfil: "perfil",
  blog: "blog",
  noticias: "noticias",
  mercado: "mercado",
  ranking: "ranking",
  aura: "aura",
  tierlist: "tierlist",
  videos: "videos",
  conquistas: "conquistas",
}

/**
 * Decide se `href` aponta pro próprio site ou pra fora.
 *
 * Aceita URL absoluta (`https://sunano.com.br/forum/x`) e caminho relativo
 * (`/forum/x`). Qualquer coisa que não seja http(s) — `javascript:`, `data:`,
 * texto que não é URL — volta como externa com hostname vazio; quem renderiza
 * trata isso como texto sem link (ver `SmartLink`), então um esquema perigoso
 * nunca vira `href` de âncora.
 */
export function classifyLink(href: string): LinkTarget {
  const trimmed = href.trim()

  // Caminho relativo: sempre interno.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return internalTarget(trimmed, firstSegment(trimmed))
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { kind: "external", href: trimmed, hostname: "" }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "external", href: trimmed, hostname: "" }
  }

  if (INTERNAL_HOSTNAMES.has(url.hostname.toLowerCase())) {
    // Guarda só o caminho: navegação interna não precisa do host, e assim um
    // link http:// pro próprio site não força o usuário a sair do https.
    return internalTarget(`${url.pathname}${url.search}${url.hash}`, firstSegment(url.pathname))
  }

  return { kind: "external", href: url.toString(), hostname: url.hostname.replace(/^www\./, "") }
}

function internalTarget(path: string, segment: string): LinkTarget {
  const section = SECTIONS[segment] ?? "site"
  return { kind: "internal", href: path || "/", section, label: SECTION_LABEL[section] }
}
