import { NextResponse } from "next/server"
import sharp from "sharp"

import { coerceAccountTier, resolveProfileMedia, type ProfileMediaField } from "@/lib/account-tier"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const runtime = "nodejs"

/**
 * Serve banner/avatar/mini-banner sempre por aqui, nunca pela URL crua do
 * Storage — ver `profileMediaProxyUrl` em `lib/account-tier.ts` pro porquê.
 *
 * Tier e validade do VIP são lidos do banco a cada request (não vêm de
 * query string nem de header): é isso que fecha o buraco de um cliente
 * simplesmente pedir a URL do bucket direto e ver o GIF rodando sem ser VIP.
 */

const COLUMN_BY_FIELD: Record<ProfileMediaField, "avatar_url" | "banner_url" | "mini_banner_url"> = {
  avatar: "avatar_url",
  banner: "banner_url",
  "mini-banner": "mini_banner_url",
}

/** Teto de espera baixando o arquivo original (bucket nosso ou avatar de OAuth ainda não copiado). */
const FETCH_TIMEOUT_MS = 8_000

/** Lado do quadro estático — o avatar/banner nunca é exibido maior que isso. */
const FROZEN_FRAME_SIZE = 256

function isProfileMediaField(value: string): value is ProfileMediaField {
  return value === "avatar" || value === "banner" || value === "mini-banner"
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; field: string }> }
) {
  const { userId, field } = await params
  if (!isProfileMediaField(field)) {
    return new NextResponse(null, { status: 404 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at, avatar_url, banner_url, mini_banner_url")
    .eq("id", userId)
    .maybeSingle()

  const url = profile?.[COLUMN_BY_FIELD[field]] ?? null
  if (!profile || !url) {
    return new NextResponse(null, { status: 404 })
  }

  const { needsFreeze } = resolveProfileMedia(
    url,
    coerceAccountTier(profile.account_tier),
    profile.vip_expires_at
  )

  if (!needsFreeze) {
    // Tier libera animação (ou o arquivo nem é GIF) — sem motivo pra gastar
    // CPU convertendo nada, o redirect aponta pro arquivo original.
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=60" },
    })
  }

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return new NextResponse(null, { status: 404 })

    const bytes = new Uint8Array(await res.arrayBuffer())

    // Sem `{ animated: true }`, o sharp decodifica só o primeiro quadro do
    // GIF — mesmo comportamento (e mesmo motivo) de `compressUploadedImage`.
    const frame = await sharp(bytes, { failOn: "none" })
      .resize(FROZEN_FRAME_SIZE, FROZEN_FRAME_SIZE, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer()

    return new NextResponse(frame, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
