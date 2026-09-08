import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  finalizeProfileMediaUpload,
  importProfileMediaFromKlipy,
  requestProfileMediaUpload,
} from "@/lib/server/profile-media-upload"

/**
 * Upload do banner em duas etapas — ver `lib/server/profile-media-upload.ts`.
 * POST gera a signed URL, PUT confirma o que foi de fato enviado pro bucket.
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
      action: "user_banner_upload",
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

    const result = await requestProfileMediaUpload("banner", authData.user.id, body.contentType, body.sizeBytes)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, path: result.path, token: result.token })
  } catch (err) {
    console.error("[upload-banner] falha inesperada:", err)
    return NextResponse.json({ error: "Erro ao iniciar envio do banner." }, { status: 500 })
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

    const result = await finalizeProfileMediaUpload("banner", authData.user.id, body.path)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, publicUrl: result.publicUrl })
  } catch (err) {
    console.error("[upload-banner] falha ao confirmar:", err)
    return NextResponse.json({ error: "Erro ao confirmar envio do banner." }, { status: 500 })
  }
}

/**
 * PATCH — grava um GIF escolhido no seletor do KLIPY. Não há signed URL aqui:
 * o arquivo não está no navegador do usuário, quem baixa é o servidor (ver
 * `importProfileMediaFromKlipy`). Compartilha o mesmo rate limit do upload
 * local — é o mesmo recurso sendo gravado.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { sourceUrl?: string } | null
    if (!body?.sourceUrl) {
      return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      action: "banner_gif_import",
      identifier: authData.user.id,
      maxAttempts: 10,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitos envios recentes. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await importProfileMediaFromKlipy("banner", authData.user.id, body.sourceUrl)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true, publicUrl: result.publicUrl })
  } catch (err) {
    console.error("[upload-banner] falha ao importar GIF:", err)
    return NextResponse.json({ error: "Erro ao salvar o GIF do banner." }, { status: 500 })
  }
}
