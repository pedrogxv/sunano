import { NextResponse } from "next/server"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { validateImageUpload } from "@/lib/server/upload-validation"
import {
  compressUploadedImage,
  IMAGE_PRESETS,
  IMMUTABLE_CACHE_CONTROL,
} from "@/lib/server/image-compression"

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]

function sanitizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

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

    if (!profile || !hasAdminPermission(profile, "blog_write")) {
      return NextResponse.json(
        { error: "Sem permissão para enviar imagens." },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const fileEntry = formData.get("file")
    const titleEntry = formData.get("title")
    const slugEntry = formData.get("slug")
    const variantEntry = formData.get("variant")

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

    const fileSeed =
      typeof titleEntry === "string"
        ? titleEntry
        : typeof slugEntry === "string"
          ? slugEntry
          : "blog"
    const slug = sanitizeSlug(fileSeed) || "blog"
    const variant = variantEntry === "thumbnail" ? "thumbnail" : "header"
    // Recomprime antes de gravar: nenhum transformador roda em runtime
    // (ver lib/server/image-compression.ts), então o objeto do bucket já
    // precisa nascer no tamanho de exibição.
    const compressed = await compressUploadedImage(
      validated.bytes,
      validated.mime,
      IMAGE_PRESETS.banner
    )

    const fileName = `blog-cover-${variant}-${slug}-${Date.now()}.${compressed.extension}`

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
      { error: "Erro ao enviar imagem de capa." },
      { status: 500 }
    )
  }
}
