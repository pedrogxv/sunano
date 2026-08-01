import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/auth-mfa"
import { countTrustedDevices, revokeAllTrustedDevices } from "@/lib/server/repositories/mfa-trusted-devices-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

/** Quantos dispositivos confiáveis (2FA) o usuário logado ainda tem válidos — Conta > Segurança. */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const count = await countTrustedDevices(user.id)
  return NextResponse.json({ count })
}

/** Revoga todos os dispositivos confiáveis — sob pedido explícito ou ao desativar o 2FA. */
export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  await revokeAllTrustedDevices(user.id)

  const cookieStore = await cookies()
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME)

  return NextResponse.json({ ok: true })
}
