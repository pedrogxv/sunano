import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json(
      { error: "Você precisa estar logado." },
      { status: 401 }
    )
  }

  const rateLimit = await checkRateLimit({
    action: "market_image_upload",
    identifier: user.id,
    maxAttempts: 30,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitos uploads recentes. Tente novamente mais tarde." },
      { status: 429 }
    )
  }

  const form = await request.formData()
  const file = form.get("file") as File | null

  if (!file) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado" },
      { status: 400 }
    )
  }

  const validated = await validateImageUpload(file, {
    maxSizeBytes: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  // Recomprime antes de gravar: nenhum transformador roda em runtime
  // (ver lib/server/image-compression.ts), então o objeto do bucket já
  // precisa nascer no tamanho de exibição.
  const compressed = await compressUploadedImage(
    validated.bytes,
    validated.mime,
    IMAGE_PRESETS.product
  )

  const filename = `market/${user.id}/${Date.now()}-${crypto.randomUUID()}.${compressed.extension}`

  const db = createSupabaseAdminClient()

  const { error } = await db.storage
    .from("images")
    .upload(filename, compressed.bytes, {
      contentType: compressed.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const {
    data: { publicUrl },
  } = db.storage.from("images").getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
