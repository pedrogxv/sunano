/**
 * Validação do link de destino de um banner da Home.
 *
 * Helper puro (sem dependência de servidor) — a API valida antes de gravar e o
 * formulário do admin reaproveita a mesma regra para avisar o usuário na hora.
 *
 * Só dois formatos são aceitos:
 * - caminho interno: começa com "/" e não com "//" (protocol-relative escaparia
 *   para outro domínio) nem "/\" (que alguns navegadores normalizam para "//");
 * - URL absoluta com esquema http ou https.
 *
 * Qualquer outra coisa — `javascript:`, `data:`, `vbscript:` — é rejeitada.
 */

export const BANNER_LINK_HINT =
  'Use um caminho interno (ex.: "/tierlist") ou uma URL completa começando com http:// ou https://.'

export function isInternalBannerLink(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
}

export function isValidBannerLink(value: string) {
  if (isInternalBannerLink(value)) return true

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Normaliza o campo do formulário: string vazia vira `null` (banner sem link). */
export function normalizeBannerLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
