import { NextRequest, NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"

/**
 * O tamanho *recomendado* de um banner é 500KB (ver painel `/admin/banners`);
 * o teto técnico é maior para não travar um upload legítimo levemente acima.
 */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const ALLOWED_MIME_TYPES = ["image/webp", "image/png", "image/jpeg"]

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "banners_write")) {
    return NextResponse.json({ error: "Sem permissão para enviar banners." }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get("file")
  const variant = form.get("variant") === "mobile" ? "mobile" : "desktop"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 })
  }

  const validated = await validateImageUpload(file, {
    maxSizeBytes: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const filename = `home-banner-${variant}-${Date.now()}-${crypto.randomUUID()}.${validated.extension}`
  const db = createSupabaseAdminClient()

  const { error } = await db.storage
    .from("peripherals")
    .upload(filename, validated.bytes, { contentType: validated.mime, upsert: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = db.storage.from("peripherals").getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
