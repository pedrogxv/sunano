import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

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

/** Quanto tempo uma URL assinada de anexo de suporte fica válida — só o bastante para carregar a página do ticket; renovada a cada leitura. */
const SIGNED_URL_TTL_SECONDS = 60 * 10

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

/**
 * Nome do objeto dentro do bucket `support`, extraído da URL pública salva em
 * `support_messages.image_urls` (gravada antes do bucket virar privado — ver
 * 20260906000000_support_bucket_private.sql). Extrair por string em vez de
 * mudar o que é gravado no banco evita migrar o histórico de mensagens.
 */
function extractSupportObjectName(url: string): string | null {
  try {
    const { pathname } = new URL(url)
    const marker = "/support/"
    const idx = pathname.lastIndexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}

/**
 * Troca as URLs de anexo salvas (públicas, de antes do bucket ficar privado,
 * ou já apontando para o objeto) por signed URLs de curta duração — chamado
 * na leitura de uma thread de suporte, nunca gravado de volta no banco.
 *
 * Silenciosamente descarta uma URL que não resolve mais (objeto apagado ou
 * fora do padrão esperado) em vez de quebrar a mensagem inteira.
 */
export async function signSupportImageUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return []

  const db = createSupabaseAdminClient()
  const signed = await Promise.all(
    urls.map(async (url) => {
      const objectName = extractSupportObjectName(url)
      if (!objectName) return null
      const { data, error } = await db.storage
        .from("support")
        .createSignedUrl(objectName, SIGNED_URL_TTL_SECONDS)
      if (error || !data) return null
      return data.signedUrl
    })
  )

  return signed.filter((url): url is string => url !== null)
}
