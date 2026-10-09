import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/server/image-compression"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateVideoUpload } from "@/lib/server/upload-validation"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

/**
 * Vídeo de deslize de mousepad/glasspad (player na página do periférico).
 * Bucket próprio (migration 20261224000000): o `peripherals` aceita só imagem.
 *
 * Aceita MP4 e MOV, mas grava tudo como `video/mp4`: o bucket só libera esse
 * tipo, e o Firefox recusa `video/quicktime` mesmo quando o vídeo dentro é o
 * H.264 de sempre. MOV e MP4 são o mesmo formato de caixas, e os navegadores
 * tocam o .mov servido como MP4.
 */
const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime"]
const STORAGE_BUCKET = "peripheral-videos"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json({ error: "Sem permissão para enviar vídeos." }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 })
  }

  const validated = await validateVideoUpload(file, {
    maxSizeBytes: UPLOAD_LIMITS.video,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const filename = `glide-${Date.now()}-${crypto.randomUUID()}.mp4`
  const db = createSupabaseAdminClient()

  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    // Nome com timestamp nunca é reaproveitado (trocar o vídeo gera path novo),
    // então cachear por um ano é seguro, igual às imagens.
    .upload(filename, validated.bytes, {
      contentType: "video/mp4",
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: false,
    })

  if (error) {
    console.error("[admin/peripherals/upload-video] upload no storage falhou:", error)
    return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
