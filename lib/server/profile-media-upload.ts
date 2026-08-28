import "server-only"

import { canUseAnimatedMedia } from "@/lib/account-tier"
import { getAccountTier } from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"
import { detectImageType } from "@/lib/server/upload-validation"

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
    maxSizeBytes: 16 * 1024 * 1024,
    gifErrorMessage: "Foto de perfil animada (GIF) é exclusiva para membros VIP.",
  },
  banner: {
    prefix: "user-banner",
    maxSizeBytes: 16 * 1024 * 1024,
    gifErrorMessage: "Banner animado (GIF) é exclusivo para membros VIP.",
  },
  "mini-banner": {
    prefix: "user-mini-banner",
    maxSizeBytes: 16 * 1024 * 1024,
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

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

function maxSizeLabel(maxSizeBytes: number) {
  return `Arquivo deve ter no máximo ${Math.floor(maxSizeBytes / (1024 * 1024))}MB.`
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
