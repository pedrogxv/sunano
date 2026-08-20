import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  ALLOWED_SUPPORT_IMAGE_MIME_TYPES,
  MAX_SUPPORT_IMAGE_BYTES,
} from "@/lib/server/support-media"
import { validateImageUpload } from "@/lib/server/upload-validation"

/** Upload de imagem anexada a uma resposta do admin — mesmo bucket `support`, prefixo `support-admin-` (ver isOwnedAdminSupportImageUrl). */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "support_write")) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  }

  const rateLimit = await checkRateLimit({
    action: "support_admin_media_upload",
    identifier: auth.profile.id,
    maxAttempts: 60,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitos envios seguidos. Aguarde um instante." }, { status: 429 })
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

  const fileName = `support-admin-${auth.profile.id}-${Date.now()}.${validated.extension}`

  const db = createSupabaseAdminClient()
  const { error: uploadError } = await db.storage
    .from("support")
    .upload(fileName, validated.bytes, { upsert: false, contentType: validated.mime })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  const { data: publicData } = db.storage.from("support").getPublicUrl(fileName)

  return NextResponse.json({ ok: true, publicUrl: publicData.publicUrl })
}
