import { NextResponse } from "next/server"

import { canUseAnimatedMedia } from "@/lib/account-tier"
import { getAccountTier } from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { validateImageUpload } from "@/lib/server/upload-validation"

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/**
 * Upload do fundo do Mini Perfil — o cartão de preview rápido, no conceito de
 * "Profile Background" da Steam.
 *
 * Rota própria (e não a de `upload-banner`) porque as duas imagens são
 * independentes: quem troca a capa grande não mexe no fundo do cartão. O nome
 * do arquivo carrega o prefixo `user-mini-banner-` para as duas nunca
 * colidirem no bucket.
 *
 * GIF é aceito apenas de contas VIP — a mesma regra do banner e do avatar — e
 * a validação usa o tipo real detectado por magic bytes, não o MIME declarado
 * pelo cliente.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const formData = await request.formData()
    const fileEntry = formData.get("file")

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      action: "user_mini_banner_upload",
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
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    })
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    if (validated.mime === "image/gif") {
      const tier = await getAccountTier(authData.user.id)
      if (!canUseAnimatedMedia(tier)) {
        return NextResponse.json(
          { error: "Fundo animado (GIF) no Mini Perfil é exclusivo para membros VIP." },
          { status: 403 }
        )
      }
    }

    const fileName = `user-mini-banner-${authData.user.id}-${Date.now()}.${validated.extension}`

    const { error: uploadError } = await supabase.storage
      .from("peripherals")
      .upload(fileName, validated.bytes, { upsert: false, contentType: validated.mime })

    if (uploadError) {
      console.error("[upload-mini-banner] falha no storage:", uploadError.message)
      return NextResponse.json(
        { error: "Não foi possível salvar a imagem. Tente novamente em instantes." },
        { status: 500 }
      )
    }

    const { data: publicData } = supabase.storage.from("peripherals").getPublicUrl(fileName)

    return NextResponse.json({ ok: true, publicUrl: publicData.publicUrl })
  } catch (err) {
    console.error("[upload-mini-banner] falha inesperada:", err)
    return NextResponse.json({ error: "Erro ao enviar o fundo do Mini Perfil." }, { status: 500 })
  }
}
