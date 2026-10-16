import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { detectVideoType } from "@/lib/server/upload-validation"
import { readVideoObjectHeader } from "@/lib/server/video-object-header"
import {
  STORE_PRODUCT_VIDEO_BUCKET,
  STORE_PRODUCT_VIDEO_MAX_BYTES,
  isStoreProductVideoName,
  newStoreProductVideoName,
} from "@/lib/store-product-video"
import { uploadTooLargeMessage } from "@/lib/upload-limits"

/**
 * Vídeo do anúncio da Loja, em duas etapas (mesmo desenho do upload de mídia
 * de perfil, `lib/server/profile-media-upload.ts`):
 *
 *  - POST devolve uma signed upload URL; o arquivo vai do navegador direto
 *    para o Storage, sem passar por aqui (a Vercel corta o corpo em ~4.5MB).
 *  - PUT confirma: como o POST não viu os bytes, confere a assinatura de
 *    MP4/MOV do objeto enviado e apaga o que não for vídeo.
 *
 * Aceita MP4 e MOV, mas grava tudo como `video/mp4` (o bucket só libera esse
 * tipo): MOV e MP4 são o mesmo formato de caixas, e os navegadores tocam o
 * .mov servido como MP4. Mesmo raciocínio de /api/admin/peripherals/upload-video.
 */
const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime"]

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function authorize() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Sem permissão para enviar vídeos." }, { status: 403 })
  }
  return null
}

export async function POST(request: NextRequest) {
  const denied = await authorize()
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as { contentType?: unknown; sizeBytes?: unknown } | null
  if (typeof body?.contentType !== "string" || typeof body.sizeBytes !== "number") {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.includes(body.contentType)) {
    return NextResponse.json({ error: "Envie um vídeo MP4 ou MOV." }, { status: 400 })
  }
  if (body.sizeBytes <= 0 || body.sizeBytes > STORE_PRODUCT_VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: uploadTooLargeMessage(STORE_PRODUCT_VIDEO_MAX_BYTES) }, { status: 400 })
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db.storage
    .from(STORE_PRODUCT_VIDEO_BUCKET)
    .createSignedUploadUrl(newStoreProductVideoName())
  if (error || !data) {
    console.error("[admin/store/upload-video] signed URL falhou:", error)
    return NextResponse.json({ error: "Não foi possível iniciar o envio. Tente novamente." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, path: data.path, token: data.token })
}

export async function PUT(request: NextRequest) {
  const denied = await authorize()
  if (denied) return denied

  const body = (await request.json().catch(() => null)) as { path?: unknown } | null
  // Formato exato, não só o prefixo: o nome vem do corpo e vai para as
  // chamadas ao Storage.
  if (typeof body?.path !== "string" || !isStoreProductVideoName(body.path)) {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 })
  }
  const path = body.path

  const db = createSupabaseAdminClient()
  const bucket = db.storage.from(STORE_PRODUCT_VIDEO_BUCKET)
  const {
    data: { publicUrl },
  } = bucket.getPublicUrl(path)

  const header = await readVideoObjectHeader(publicUrl).catch(() => null)
  if (!header) {
    return NextResponse.json({ error: "Não foi possível confirmar o envio." }, { status: 400 })
  }

  const detected = detectVideoType(header)
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    await bucket.remove([path])
    return NextResponse.json({ error: "O arquivo não é um vídeo MP4 ou MOV válido." }, { status: 400 })
  }

  return NextResponse.json({ ok: true, publicUrl })
}
