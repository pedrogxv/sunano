import "server-only"

/**
 * Limites de anexo de imagem em ticket de suporte — bucket dedicado `support`
 * (ver 20260921000016_support_tickets.sql). Teto mais alto que comentário
 * (2MB vs 1MB) porque aqui é print de erro/produto com defeito, mas ainda
 * contido: suporte tem volume bem menor que comentário, então o custo de
 * storage/egress escala mais devagar.
 */
export const MAX_SUPPORT_IMAGES_PER_MESSAGE = 3
export const MAX_SUPPORT_IMAGE_BYTES = 2 * 1024 * 1024
export const ALLOWED_SUPPORT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/**
 * Confere que a URL enviada pelo cliente veio mesmo de um upload feito por
 * este usuário em `/api/support/upload-image` — sem isso, o body do POST de
 * ticket/mensagem aceitaria qualquer URL externa, inflando o anexo sem nunca
 * passar pela validação de tamanho/MIME, ou a URL do upload de outra pessoa.
 */
export function isOwnedSupportImageUrl(url: string, userId: string): boolean {
  try {
    const { pathname } = new URL(url)
    return pathname.includes(`/support/support-${userId}-`)
  } catch {
    return false
  }
}

/** Mesma checagem, para anexos enviados pelo admin em `/api/admin/support/upload-image`. */
export function isOwnedAdminSupportImageUrl(url: string, adminId: string): boolean {
  try {
    const { pathname } = new URL(url)
    return pathname.includes(`/support/support-admin-${adminId}-`)
  } catch {
    return false
  }
}
