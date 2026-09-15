import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

import { SOFTWARE_LOGO_BUCKET, SOFTWARE_LOGO_PREFIX } from "../schema"

const ALLOWED_MIME_TYPES = ["image/png", "image/webp", "image/jpeg"]

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Logo de um card de /softwares. O card tem no máximo ~300px de largura, então
 * o preset de avatar (512px) cobre tela 2x. PNG transparente sai WebP com
 * alpha preservado.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "brands_write")) {
    return NextResponse.json({ error: "Sem permissão para enviar logos." }, { status: 403 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 })
  }

  const validated = await validateImageUpload(file, {
    maxSizeBytes: UPLOAD_LIMITS.image,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const compressed = await compressUploadedImage(validated.bytes, validated.mime, IMAGE_PRESETS.avatar)

  const filename = `${SOFTWARE_LOGO_PREFIX}${Date.now()}-${crypto.randomUUID()}.${compressed.extension}`
  const db = createSupabaseAdminClient()

  const { error } = await db.storage.from(SOFTWARE_LOGO_BUCKET).upload(filename, compressed.bytes, {
    contentType: compressed.mime,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    upsert: false,
  })

  if (error) {
    console.error("[admin/softwares/upload-image] upload no storage falhou:", error)
    return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = db.storage.from(SOFTWARE_LOGO_BUCKET).getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
