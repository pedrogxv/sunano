import { NextResponse } from "next/server"

import { requireWebMaster } from "@/lib/server/auth/admin-auth"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"
import { createImageThumbnails } from "@/lib/server/image-thumbnails"
import {
  GIVEAWAY_IMAGE_BUCKET,
  giveawayImageFileName,
} from "@/lib/server/repositories/giveaways-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

const ALLOWED_MIME_TYPES = ["image/webp", "image/png", "image/jpeg"]

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Foto do prêmio quando ele não está no catálogo de periféricos. */
export async function POST(request: Request) {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 })
  }

  const validated = await validateImageUpload(file, {
    maxSizeBytes: UPLOAD_LIMITS.image,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const compressed = await compressUploadedImage(validated.bytes, validated.mime, IMAGE_PRESETS.product)
  const filename = giveawayImageFileName(compressed.extension)
  const db = createSupabaseAdminClient()

  const { error } = await db.storage.from(GIVEAWAY_IMAGE_BUCKET).upload(filename, compressed.bytes, {
    contentType: compressed.mime,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    upsert: false,
  })
  if (error) {
    console.error("[admin/giveaways/upload-image] upload no storage falhou:", error)
    return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
  }

  await createImageThumbnails(db, GIVEAWAY_IMAGE_BUCKET, filename, compressed.bytes, compressed.mime)

  const {
    data: { publicUrl },
  } = db.storage.from(GIVEAWAY_IMAGE_BUCKET).getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
