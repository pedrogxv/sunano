import { NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/server/rate-limit"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"

/**
 * Upload de imagem para post do fórum. Diferente do upload de capa do blog
 * (app/api/admin/blog/upload-cover/route.ts), aqui quem envia é o próprio
 * usuário comum (não-admin) — a RLS de storage.objects restringe o nome do
 * arquivo ao prefixo `forum-post-<uid>-*` (20260809_forum_media_storage_rls.sql).
 */

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json(
        { error: "Você precisa estar logado para enviar mídia." },
        { status: 401 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "forum_media_upload",
      identifier: authData.user.id,
      maxAttempts: 10,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Você enviou muitos arquivos recentemente. Tente novamente mais tarde.",
        },
        { status: 429 }
      )
    }

    const formData = await request.formData()
    const fileEntry = formData.get("file")

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })
    }

    const validated = await validateImageUpload(fileEntry, {
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
      IMAGE_PRESETS.content
    )

    const fileName = `forum-post-${authData.user.id}-${Date.now()}.${compressed.extension}`

    const { error: uploadError } = await supabase.storage
      .from("peripherals")
      .upload(fileName, compressed.bytes, {
        upsert: false,
        contentType: compressed.mime,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 })
    }

    const { data: publicData } = supabase.storage
      .from("peripherals")
      .getPublicUrl(fileName)

    return NextResponse.json({ ok: true, publicUrl: publicData.publicUrl })
  } catch {
    return NextResponse.json(
      { error: "Erro ao enviar imagem." },
      { status: 500 }
    )
  }
}
