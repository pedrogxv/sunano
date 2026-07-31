const URL_PATTERN = /https?:\/\/[^\s<>"']+/i

/** Encontra a primeira URL http(s) dentro de um texto livre, ou `null` se não houver. */
export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(URL_PATTERN)
  if (!match) return null
  // Remove pontuação de fechamento colada ao final do link (".", ",", ")", etc.)
  return match[0].replace(/[.,;:!?)\]]+$/, "")
}
