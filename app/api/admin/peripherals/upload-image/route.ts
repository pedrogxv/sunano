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

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "peripherals_write")) {
    return NextResponse.json(
      { error: "Sem permissão para enviar imagens." },
      { status: 403 }
    )
  }

  const form = await request.formData()
  const file = form.get("file") as File | null
  const kind = form.get("kind") as string | null

  if (!file) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado." },
      { status: 400 }
    )
  }

  const allowed =
    kind === "gallery"
      ? ["image/jpeg"]
      : ["image/jpeg", "image/png", "image/webp", "image/gif"]

  const validated = await validateImageUpload(file, {
    maxSizeBytes: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: allowed,
  })
  if (!validated.ok) {
    return NextResponse.json(
      {
        error:
          kind === "gallery" && !allowed.includes(file.type)
            ? "Apenas arquivos JPEG são permitidos."
            : validated.error,
      },
      { status: 400 }
    )
  }

  // Recomprime antes de gravar: nenhum transformador roda em runtime
  // (ver lib/server/image-compression.ts), então o objeto do bucket já
  // precisa nascer no tamanho de exibição.
  const compressed = await compressUploadedImage(
    validated.bytes,
    validated.mime,
    IMAGE_PRESETS.product
  )

  const filename = `${Date.now()}-${crypto.randomUUID()}.${compressed.extension}`

  const db = createSupabaseAdminClient()

  const { error } = await db.storage
    .from("peripherals")
    .upload(filename, compressed.bytes, {
      contentType: compressed.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: false,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = db.storage.from("peripherals").getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
