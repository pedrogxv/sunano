import { NextResponse } from "next/server"

import {
  ALLOWED_COMMENT_IMAGE_MIME_TYPES,
  MAX_COMMENT_IMAGE_BYTES,
} from "@/lib/server/comment-media"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { validateImageUpload } from "@/lib/server/upload-validation"

/**
 * Upload de imagem anexada a um comentário — endpoint único reaproveitado
 * por fórum e blog (o comentário em si ainda é criado via
 * `/api/forum/posts/[slug]/comments` ou `/api/blog/[slug]/comments`, que só
 * recebem a URL já publicada). Mesmo padrão de
 * app/api/forum/posts/upload-media/route.ts, mas com limite bem mais baixo
 * (1MB) porque comentário tem volume muito maior que post — ver
 * lib/server/comment-media.ts.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Você precisa estar logado para enviar imagens." }, { status: 401 })
    }

    const rateLimit = await checkRateLimit({
      action: "comment_media_upload",
      identifier: authData.user.id,
      maxAttempts: 20,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você enviou muitas imagens recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const formData = await request.formData()
    const fileEntry = formData.get("file")

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })
    }

    const validated = await validateImageUpload(fileEntry, {
      maxSizeBytes: MAX_COMMENT_IMAGE_BYTES,
      allowedMimeTypes: ALLOWED_COMMENT_IMAGE_MIME_TYPES,
    })
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const fileName = `comment-${authData.user.id}-${Date.now()}.${validated.extension}`

    const { error: uploadError } = await supabase.storage
      .from("comments")
      .upload(fileName, validated.bytes, {
        upsert: false,
        contentType: validated.mime,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 })
    }

    const { data: publicData } = supabase.storage.from("comments").getPublicUrl(fileName)

    return NextResponse.json({ ok: true, publicUrl: publicData.publicUrl })
  } catch {
    return NextResponse.json({ error: "Erro ao enviar imagem." }, { status: 500 })
  }
}
