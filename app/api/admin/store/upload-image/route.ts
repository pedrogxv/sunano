import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 400 })
  }

  const ext = file.name.split(".").pop() ?? "jpg"
  const filename = `store/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const db = createSupabaseAdminClient()

  // Ensure the bucket exists (no-op if already created)
  await db.storage.createBucket("images", { public: true, allowedMimeTypes: ["image/*"] })

  const { error } = await db.storage
    .from("images")
    .upload(filename, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = db.storage.from("images").getPublicUrl(filename)

  return NextResponse.json({ ok: true, publicUrl })
}
