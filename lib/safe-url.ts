/**
 * Guarda de protocolo para URLs que virão de fontes externas/de usuário e
 * são renderizadas como `href`. Um `href="javascript:..."` executa ao clique
 * — vetor clássico de XSS. Aqui só passam `http(s):` e `mailto:`; qualquer
 * outra coisa (javascript:, data:, vbscript:, blob: em href, etc.) vira
 * `undefined`, e o React simplesmente não emite o atributo.
 *
 * Não substitui a validação na ESCRITA (ver lib/server/comment-media.ts,
 * lib/server/support-media.ts) — é a segunda barreira, no render.
 */
const SAFE_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  // URL relativa (mesma origem) é sempre segura.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed
  try {
    const parsed = new URL(trimmed)
    return SAFE_HREF_PROTOCOLS.has(parsed.protocol) ? trimmed : undefined
  } catch {
    return undefined
  }
}
