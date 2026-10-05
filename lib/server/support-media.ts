import "server-only"

import { getStoragePublicOrigin } from "@/lib/server/storage-origin"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

/**
 * Limites de anexo de imagem em ticket de suporte — bucket dedicado `support`
 * (ver 20260921000016_support_tickets.sql). Teto mais alto que comentário
 * (2MB vs 1MB) porque aqui é print de erro/produto com defeito, mas ainda
 * contido: suporte tem volume bem menor que comentário, então o custo de
 * storage/egress escala mais devagar.
 */
export const MAX_SUPPORT_IMAGES_PER_MESSAGE = 3
export const MAX_SUPPORT_IMAGE_BYTES = UPLOAD_LIMITS.support
export const ALLOWED_SUPPORT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/** Quanto tempo uma URL assinada de anexo de suporte fica válida — só o bastante para carregar a página do ticket; renovada a cada leitura. */
const SIGNED_URL_TTL_SECONDS = 60 * 10

/**
 * Caminhos de um objeto do bucket `support`: assinado (o que o upload devolve)
 * ou público (mensagens gravadas antes de o bucket virar privado).
 */
const SUPPORT_OBJECT_PATHS = [
  "/storage/v1/object/sign/support/",
  "/storage/v1/object/public/support/",
]

/** `<timestamp>.<ext>`, o que sobra do nome depois de `support-<uid>-`. */
const SUPPORT_FILE_TAIL_RE = /^\d+\.[a-z0-9]{2,5}$/i

/**
 * Nome do objeto dentro do bucket `support`, tirado de uma URL do nosso
 * Storage. É A ÚNICA regra de leitura de URL de anexo: a validação de posse e a
 * assinatura (`signSupportImageUrls`) passam por aqui. Quando eram duas regras,
 * a validação aceitava `.../support/support-<meu-id>-x/support/support-<id-de-
 * outro>-y.png` (via `includes`) e a assinatura, que olhava o ÚLTIMO
 * `/support/`, assinava o anexo da outra pessoa.
 *
 * Âncora no início do caminho, nome sem `/`. `requireOwnOrigin = false` só na
 * leitura de linha já gravada: o host nunca foi o que importa para assinar, e
 * exigir a origem atual sumiria com anexo antigo se o domínio do projeto mudar.
 */
function supportObjectName(url: string, requireOwnOrigin: boolean): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const origin = getStoragePublicOrigin()
  if (requireOwnOrigin && origin && parsed.origin !== origin) return null

  const prefix = SUPPORT_OBJECT_PATHS.find((candidate) => parsed.pathname.startsWith(candidate))
  if (!prefix) return null

  let name: string
  try {
    name = decodeURIComponent(parsed.pathname.slice(prefix.length))
  } catch {
    return null
  }
  return name.length > 0 && !name.includes("/") ? name : null
}

function isSupportFileOf(url: string, namePrefix: string): boolean {
  const name = supportObjectName(url, true)
  if (!name || !name.startsWith(namePrefix)) return false
  return SUPPORT_FILE_TAIL_RE.test(name.slice(namePrefix.length))
}

/**
 * Confere que a URL enviada pelo cliente veio mesmo de um upload feito por
 * este usuário em `/api/support/upload-image` — sem isso, o body do POST de
 * ticket/mensagem aceitaria qualquer URL externa, inflando o anexo sem nunca
 * passar pela validação de tamanho/MIME, ou a URL do upload de outra pessoa.
 * Host, bucket e nome exato (`support-<uid>-<timestamp>.<ext>`).
 */
export function isOwnedSupportImageUrl(url: string, userId: string): boolean {
  return isSupportFileOf(url, `support-${userId}-`)
}

/** Mesma checagem, para anexos enviados pelo admin em `/api/admin/support/upload-image`. */
export function isOwnedAdminSupportImageUrl(url: string, adminId: string): boolean {
  return isSupportFileOf(url, `support-admin-${adminId}-`)
}

/**
 * Nome do objeto dentro do bucket `support`, extraído da URL salva em
 * `support_messages.image_urls` (a pública, gravada antes do bucket virar
 * privado, ou a assinada; ver 20260906000000_support_bucket_private.sql).
 * Extrair por string em vez de mudar o que é gravado no banco evita migrar o
 * histórico de mensagens.
 */
function extractSupportObjectName(url: string): string | null {
  return supportObjectName(url, false)
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
