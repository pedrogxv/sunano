import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  ALLOWED_STORE_REVIEW_IMAGE_MIME_TYPES,
  MAX_STORE_REVIEW_IMAGE_BYTES,
  STORE_REVIEW_BUCKET,
  storeReviewImageFileName,
} from "@/lib/server/store-review-media"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Upload de foto de avaliação de produto. A avaliação em si é criada em
 * `/api/store/products/[slug]/reviews`, que só recebe a URL já publicada e
 * confere a posse por `isOwnedStoreReviewImageUrl`.
 */
export async function POST(request: NextRequest) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para enviar fotos." }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "store_review_media_upload",
    identifier: user.id,
    maxAttempts: 20,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Você enviou muitas fotos recentemente. Tente novamente mais tarde." },
      { status: 429 }
    )
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })
  }

  const validated = await validateImageUpload(file, {
    maxSizeBytes: MAX_STORE_REVIEW_IMAGE_BYTES,
    allowedMimeTypes: ALLOWED_STORE_REVIEW_IMAGE_MIME_TYPES,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const compressed = await compressUploadedImage(validated.bytes, validated.mime, IMAGE_PRESETS.content)

  // O nome sai da sessão, nunca do corpo.
  const fileName = storeReviewImageFileName(user.id, compressed.extension)
  const db = createSupabaseAdminClient()
  const { error } = await db.storage.from(STORE_REVIEW_BUCKET).upload(fileName, compressed.bytes, {
    upsert: false,
    contentType: compressed.mime,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  })

  if (error) {
    console.error("[store/reviews/upload-image] upload no storage falhou:", error)
    return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
  }

  const { data } = db.storage.from(STORE_REVIEW_BUCKET).getPublicUrl(fileName)
  return NextResponse.json({ ok: true, publicUrl: data.publicUrl })
}
