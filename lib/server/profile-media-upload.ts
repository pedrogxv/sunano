import "server-only"

import { canUseAnimatedMedia } from "@/lib/account-tier"
import { getAccountTier } from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"
import { isKlipyGifUrl } from "@/lib/klipy"
import { detectImageType } from "@/lib/server/upload-validation"
import { UPLOAD_LIMITS, uploadTooLargeMessage } from "@/lib/upload-limits"

/**
 * Upload de mídia de perfil (avatar, banner, fundo do Mini Perfil) em duas
 * etapas, pra contornar o corpo de requisição da Vercel (hard-capado em
 * ~4.5MB nas serverless functions):
 *
 *  1. `requestProfileMediaUpload` — valida sessão/tier/tamanho declarado e
 *     devolve uma signed upload URL. O arquivo em si vai direto do navegador
 *     pro Storage do Supabase, sem passar pelo Route Handler.
 *  2. `finalizeProfileMediaUpload` — como o passo 1 não viu os bytes reais,
 *     este baixa o objeto recém-enviado e repete a validação de verdade
 *     (magic bytes, tamanho, tier de GIF) antes de liberar a URL pública.
 *     Arquivo inválido é apagado do bucket, nunca fica exposto.
 */

const BUCKET = "peripherals"

export type ProfileMediaField = "avatar" | "banner" | "mini-banner"

type FieldConfig = {
  prefix: string
  maxSizeBytes: number
  gifErrorMessage: string
}

const FIELD_CONFIG: Record<ProfileMediaField, FieldConfig> = {
  avatar: {
    prefix: "user-avatar",
    maxSizeBytes: UPLOAD_LIMITS.profileMedia,
    gifErrorMessage: "Foto de perfil animada (GIF) é exclusiva para membros VIP.",
  },
  banner: {
    prefix: "user-banner",
    maxSizeBytes: UPLOAD_LIMITS.profileMedia,
    gifErrorMessage: "Banner animado (GIF) é exclusivo para membros VIP.",
  },
  "mini-banner": {
    prefix: "user-mini-banner",
    maxSizeBytes: UPLOAD_LIMITS.profileMedia,
    gifErrorMessage: "Fundo animado (GIF) no Mini Perfil é exclusivo para membros VIP.",
  },
}

/**
 * Avatar é exibido no máximo a ~200px; banner e mini banner ocupam a largura
 * do card de perfil. Nenhum deles justifica os 16MB que o passo 1 aceita —
 * esse teto existe só para o arquivo original caber na signed URL.
 */
const PRESET_BY_FIELD: Record<ProfileMediaField, (typeof IMAGE_PRESETS)[keyof typeof IMAGE_PRESETS]> = {
  avatar: IMAGE_PRESETS.avatar,
  banner: IMAGE_PRESETS.banner,
  "mini-banner": IMAGE_PRESETS.banner,
}

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/** Teto de espera ao baixar do CDN do KLIPY — a rota não pode ficar pendurada. */
const KLIPY_FETCH_TIMEOUT_MS = 15_000

/**
 * Teto de espera ao copiar o avatar do provedor OAuth. Bem menor que o do
 * KLIPY de propósito: isto roda dentro do callback de login, e o usuário está
 * parado numa tela em branco esperando o redirect.
 */
const OAUTH_AVATAR_FETCH_TIMEOUT_MS = 8_000

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

function maxSizeLabel(maxSizeBytes: number) {
  return uploadTooLargeMessage(maxSizeBytes)
}

type ErrorResult = { ok: false; error: string; status: number }

export async function requestProfileMediaUpload(
  field: ProfileMediaField,
  userId: string,
  contentType: string,
  sizeBytes: number
): Promise<ErrorResult | { ok: true; path: string; token: string }> {
  const config = FIELD_CONFIG[field]

  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return { ok: false, error: "Tipo de arquivo não permitido.", status: 400 }
  }
  if (sizeBytes > config.maxSizeBytes) {
    return { ok: false, error: maxSizeLabel(config.maxSizeBytes), status: 400 }
  }
  if (contentType === "image/gif") {
    const tier = await getAccountTier(userId)
    if (!canUseAnimatedMedia(tier)) {
      return { ok: false, error: config.gifErrorMessage, status: 403 }
    }
  }

  const extension = EXTENSION_BY_MIME[contentType]
  const path = `${config.prefix}-${userId}-${Date.now()}.${extension}`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return { ok: false, error: "Não foi possível iniciar o upload. Tente novamente.", status: 500 }
  }

  return { ok: true, path: data.path, token: data.token }
}

export async function finalizeProfileMediaUpload(
  field: ProfileMediaField,
  userId: string,
  path: string
): Promise<ErrorResult | { ok: true; publicUrl: string }> {
  const config = FIELD_CONFIG[field]

  // O path é gerado pelo passo anterior com o prefixo do usuário — confere
  // que ninguém está tentando confirmar um objeto que não pediu.
  if (!path.startsWith(`${config.prefix}-${userId}-`)) {
    return { ok: false, error: "Upload inválido.", status: 400 }
  }

  const supabase = createSupabaseAdminClient()
  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(path)
  if (downloadError || !blob) {
    return { ok: false, error: "Não foi possível confirmar o upload.", status: 400 }
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())

  if (bytes.length > config.maxSizeBytes) {
    await supabase.storage.from(BUCKET).remove([path])
    return { ok: false, error: maxSizeLabel(config.maxSizeBytes), status: 400 }
  }

  const detected = detectImageType(bytes)
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    await supabase.storage.from(BUCKET).remove([path])
    return { ok: false, error: "O conteúdo do arquivo não corresponde a uma imagem válida.", status: 400 }
  }

  if (detected.mime === "image/gif") {
    const tier = await getAccountTier(userId)
    if (!canUseAnimatedMedia(tier)) {
      await supabase.storage.from(BUCKET).remove([path])
      return { ok: false, error: config.gifErrorMessage, status: 403 }
    }
  }

  // O objeto já está no bucket (foi direto do navegador pela signed URL), e
  // este é o único ponto do fluxo que enxerga os bytes — então é aqui que a
  // recompressão acontece. Sem isso, o limite de 16MB acima virava 16MB
  // trafegados a cada exibição do perfil: nenhum transformador roda em
  // runtime (ver lib/server/image-compression.ts). GIF do VIP passa intacto.
  const compressed = await compressUploadedImage(bytes, detected.mime, PRESET_BY_FIELD[field])

  // O upload via signed URL pode não ter gravado o content-type correto —
  // regrava com o tipo real detectado pelos magic bytes (ou o WebP recém
  // gerado). `upsert` mantém o mesmo path, então a URL pública não muda.
  await supabase.storage
    .from(BUCKET)
    .update(path, compressed.bytes, {
      contentType: compressed.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: true,
    })

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { ok: true, publicUrl: publicData.publicUrl }
}

/**
 * Importa uma mídia do CDN do KLIPY (escolhida no seletor de GIF) para o
 * bucket, como se tivesse sido enviada pelo usuário.
 *
 * Existe porque mídia de perfil **não pode** ficar hospedada fora: banner e
 * avatar passam pelo `image-loader` do Storage e pela recompressão daqui, e
 * um link do KLIPY salvo cru quebraria os dois (além de virar hotlink
 * permanente numa URL que eles podem rotacionar). Diferente do fórum, onde a
 * URL do KLIPY é só mais uma imagem de comentário.
 *
 * O servidor é quem baixa: a mesma checagem de host/extensão de
 * `isKlipyGifUrl` roda aqui antes do fetch (SSRF — a URL vem do cliente), e
 * os bytes ainda passam por magic bytes, tamanho e tier de GIF, exatamente
 * como no fluxo de arquivo local.
 */
export async function importProfileMediaFromKlipy(
  field: ProfileMediaField,
  userId: string,
  sourceUrl: string
): Promise<ErrorResult | { ok: true; publicUrl: string }> {
  const config = FIELD_CONFIG[field]

  if (!isKlipyGifUrl(sourceUrl)) {
    return { ok: false, error: "Essa URL não é uma mídia válida do seletor de GIF.", status: 400 }
  }

  // GIF do KLIPY é animado por definição — cobra o tier antes de gastar
  // banda baixando o arquivo.
  const tier = await getAccountTier(userId)
  if (!canUseAnimatedMedia(tier)) {
    return { ok: false, error: config.gifErrorMessage, status: 403 }
  }

  let bytes: Uint8Array
  try {
    const res = await fetch(sourceUrl, {
      // Sem cache: o arquivo é gravado no nosso bucket logo em seguida.
      cache: "no-store",
      signal: AbortSignal.timeout(KLIPY_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      return { ok: false, error: "Não foi possível baixar o GIF escolhido.", status: 400 }
    }
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > config.maxSizeBytes) {
      return { ok: false, error: maxSizeLabel(config.maxSizeBytes), status: 400 }
    }
    bytes = new Uint8Array(buffer)
  } catch {
    return { ok: false, error: "Não foi possível baixar o GIF escolhido.", status: 400 }
  }

  const detected = detectImageType(bytes)
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    return { ok: false, error: "O conteúdo baixado não é uma imagem válida.", status: 400 }
  }

  const extension = EXTENSION_BY_MIME[detected.mime]
  const path = `${config.prefix}-${userId}-${Date.now()}.${extension}`

  // Mesma recompressão do upload local — GIF passa intacto (ver
  // `compressUploadedImage`), que é justamente o ponto de escolher um.
  const compressed = await compressUploadedImage(bytes, detected.mime, PRESET_BY_FIELD[field])

  const supabase = createSupabaseAdminClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed.bytes, {
      contentType: compressed.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: true,
    })
  if (uploadError) {
    return { ok: false, error: "Não foi possível salvar o GIF. Tente novamente.", status: 500 }
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { ok: true, publicUrl: publicData.publicUrl }
}

/**
 * Copia o avatar do provedor OAuth (Google/Discord) para o nosso bucket, no
 * primeiro login.
 *
 * Existe porque a URL do provedor é um empréstimo, não um endereço estável:
 * o Discord deriva o caminho do hash do avatar
 * (`/avatars/{id}/{hash}.gif`), então **trocar a foto por lá apaga a URL
 * antiga** — o CDN passa a devolver 404 e o perfil no nosso site fica sem
 * imagem, sem que nada tenha mudado do nosso lado. Foi assim que um perfil
 * VIP perdeu a foto em 2026-09-10: o arquivo nunca esteve conosco, só o
 * texto da URL. O Google tem o mesmo problema por outros motivos (rotação
 * de URL, conta removida).
 *
 * A cópia é feita **uma vez, na origem**, e deliberadamente NUNCA
 * re-sincronizada depois. Manter espelhado com o provedor significaria
 * sobrescrever em silêncio a foto que a pessoa escolheu no editor daqui só
 * porque ela mexeu no avatar do Discord — o provedor é semente inicial, não
 * fonte da verdade. Quem quiser trocar usa o upload do perfil, que já existe.
 *
 * Diferente de `importProfileMediaFromKlipy`, aqui **não** se cobra o tier de
 * GIF: o gate de mídia animada continua valendo na renderização
 * (`resolveProfileMedia`), e aplicá-lo neste ponto mudaria a foto de quem já
 * entrou — a importação só troca o lugar onde o arquivo mora, nunca o que a
 * pessoa vê.
 *
 * Best-effort por contrato: qualquer falha devolve `null` e o chamador segue
 * com a URL do provedor, exatamente como antes. Login nunca trava por causa
 * de avatar.
 */
export async function importOAuthAvatar(
  userId: string,
  sourceUrl: string
): Promise<string | null> {
  const config = FIELD_CONFIG.avatar

  // A URL vem do provedor de identidade (não do cliente), mas só http(s)
  // pode virar fetch — barra `file:`/`data:` caso um metadado venha torto.
  try {
    const { protocol } = new URL(sourceUrl)
    if (protocol !== "https:" && protocol !== "http:") return null
  } catch {
    return null
  }

  try {
    const res = await fetch(sourceUrl, {
      // Sem cache: os bytes vão direto para o nosso bucket em seguida.
      cache: "no-store",
      signal: AbortSignal.timeout(OAUTH_AVATAR_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const buffer = await res.arrayBuffer()
    // Avatar do provedor costuma ter poucos KB, mas GIF do Discord chega a
    // vários MB — acima do teto, desiste em vez de guardar peso morto.
    if (buffer.byteLength > config.maxSizeBytes) return null

    const bytes = new Uint8Array(buffer)
    const detected = detectImageType(bytes)
    if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) return null

    const extension = EXTENSION_BY_MIME[detected.mime]
    const path = `${config.prefix}-${userId}-${Date.now()}.${extension}`

    // Mesma recompressão do upload local: o avatar do Discord vem no tamanho
    // original (o da LuanaMaya tinha 5,8MB) e era servido cru a cada visita.
    // GIF passa intacto — ver `compressUploadedImage`.
    const compressed = await compressUploadedImage(bytes, detected.mime, PRESET_BY_FIELD.avatar)

    const supabase = createSupabaseAdminClient()
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, compressed.bytes, {
        contentType: compressed.mime,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
        upsert: true,
      })
    if (uploadError) return null

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return publicData.publicUrl
  } catch {
    // Timeout/DNS/host fora do ar — o chamador cai na URL do provedor.
    return null
  }
}
