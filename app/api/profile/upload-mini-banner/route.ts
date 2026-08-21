import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { finalizeProfileMediaUpload, requestProfileMediaUpload } from "@/lib/server/profile-media-upload"

/**
 * Upload do fundo do Mini Perfil em duas etapas — ver
 * `lib/server/profile-media-upload.ts`. POST gera a signed URL, PUT confirma
 * o que foi de fato enviado pro bucket.
 *
 * Rota própria (e não a de `upload-banner`) porque as duas imagens são
 * independentes: quem troca a capa grande não mexe no fundo do cartão.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as
      | { contentType?: string; sizeBytes?: number }
      | null
    if (!body?.contentType || typeof body.sizeBytes !== "number") {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
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

    const result = await requestProfileMediaUpload(
      "mini-banner",
      authData.user.id,
      body.contentType,
      body.sizeBytes
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, path: result.path, token: result.token })
  } catch (err) {
    console.error("[upload-mini-banner] falha inesperada:", err)
    return NextResponse.json({ error: "Erro ao iniciar envio do fundo do Mini Perfil." }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { path?: string } | null
    if (!body?.path) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
    }

    const result = await finalizeProfileMediaUpload("mini-banner", authData.user.id, body.path)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, publicUrl: result.publicUrl })
  } catch (err) {
    console.error("[upload-mini-banner] falha ao confirmar:", err)
    return NextResponse.json({ error: "Erro ao confirmar envio do fundo do Mini Perfil." }, { status: 500 })
  }
}
