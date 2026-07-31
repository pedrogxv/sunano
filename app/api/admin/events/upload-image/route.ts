import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { validateImageUpload } from "@/lib/server/upload-validation"

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

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
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
  }

  const validated = await validateImageUpload(file, {
    maxSizeBytes: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const filename = `events/${Date.now()}-${crypto.randomUUID()}.${validated.extension}`

  const db = createSupabaseAdminClient()

  await db.storage.createBucket("images", { public: true, allowedMimeTypes: ALLOWED_MIME_TYPES })
  await db.storage.updateBucket("images", { public: true, allowedMimeTypes: ALLOWED_MIME_TYPES })

  const { error } = await db.storage
    .from("images")
    .upload(filename, validated.bytes, { contentType: validated.mime, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = db.storage.from("images").getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
