import { NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"
import { UPLOAD_LIMITS } from "@/lib/upload-limits"

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json(
        { error: "Sessão expirada. Entre novamente no admin." },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from("admin_profiles")
      .select("id, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    if (!profile || !hasAdminPermission(profile, "profile_write")) {
      return NextResponse.json(
        { error: "Sem permissão para atualizar o perfil." },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const fileEntry = formData.get("file")

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      action: "admin_avatar_upload",
      identifier: authData.user.id,
      maxAttempts: 10,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitos uploads recentes. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const validated = await validateImageUpload(fileEntry, {
      maxSizeBytes: UPLOAD_LIMITS.profileMedia,
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
      IMAGE_PRESETS.avatar
    )

    const fileName = `admin-avatar-${authData.user.id}-${Date.now()}.${compressed.extension}`

    // Admin client: storage.objects não tem policy para cliente
    // (20261104000000); a permissão profile_write já foi conferida acima.
    const db = createSupabaseAdminClient()
    const { error: uploadError } = await db.storage
      .from("peripherals")
      .upload(fileName, compressed.bytes, {
        upsert: false,
        contentType: compressed.mime,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      })

    if (uploadError) {
      console.error("[admin/profile/upload-avatar] upload no storage falhou:", uploadError)
      return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 })
    }

    const { data: publicData } = db.storage
      .from("peripherals")
      .getPublicUrl(fileName)

    return NextResponse.json({ ok: true, publicUrl: publicData.publicUrl })
  } catch {
    return NextResponse.json(
      { error: "Erro ao enviar avatar." },
      { status: 500 }
    )
  }
}
