import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
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
    maxSizeBytes: UPLOAD_LIMITS.image,
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

  const filename = `aura-items/${Date.now()}-${crypto.randomUUID()}.${compressed.extension}`

  const db = createSupabaseAdminClient()

  await db.storage.createBucket("images", {
    public: true,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  await db.storage.updateBucket("images", {
    public: true,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })

  const { error } = await db.storage
    .from("images")
    .upload(filename, compressed.bytes, {
      contentType: compressed.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: false,
    })

  if (error) {
    console.error("[admin/aura-itens/upload-image] upload no storage falhou:", error)
    return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = db.storage.from("images").getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
