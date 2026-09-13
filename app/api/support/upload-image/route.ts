import { NextResponse } from "next/server"

import {
  ALLOWED_SUPPORT_IMAGE_MIME_TYPES,
  MAX_SUPPORT_IMAGE_BYTES,
} from "@/lib/server/support-media"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"

/**
 * Upload de imagem anexada a um ticket de suporte (mensagem inicial ou
 * resposta). Mesmo padrão de app/api/comments/upload-image/route.ts —
 * magic-bytes primeiro, nome do arquivo nunca vem do cliente.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json(
        { error: "Você precisa estar logado para enviar imagens." },
        { status: 401 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "support_media_upload",
      identifier: authData.user.id,
      maxAttempts: 20,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Você enviou muitas imagens recentemente. Tente novamente mais tarde.",
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
      maxSizeBytes: MAX_SUPPORT_IMAGE_BYTES,
      allowedMimeTypes: ALLOWED_SUPPORT_IMAGE_MIME_TYPES,
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

    const fileName = `support-${authData.user.id}-${Date.now()}.${compressed.extension}`

    // Admin client: storage.objects não tem policy para cliente
    // (20261104000000). O nome do arquivo vem da sessão, nunca do corpo.
    const db = createSupabaseAdminClient()
    const { error: uploadError } = await db.storage
      .from("support")
      .upload(fileName, compressed.bytes, {
        upsert: false,
        contentType: compressed.mime,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      })

    if (uploadError) {
      console.error("[support/upload-image] upload no storage falhou:", uploadError)
      return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
    }

    // Bucket `support` é privado (20260906120000_support_bucket_private.sql) —
    // devolve uma signed URL só para o preview imediato no formulário; a
    // exibição depois de enviada a mensagem é sempre re-assinada na leitura
    // (support-repository.ts, via signSupportImageUrls).
    const { data: signedData, error: signError } = await db.storage
      .from("support")
      .createSignedUrl(fileName, 600)

    if (signError || !signedData) {
      return NextResponse.json({ error: "Erro ao gerar link da imagem." }, { status: 500 })
    }

    return NextResponse.json({ ok: true, publicUrl: signedData.signedUrl })
  } catch {
    return NextResponse.json(
      { error: "Erro ao enviar imagem." },
      { status: 500 }
    )
  }
}
