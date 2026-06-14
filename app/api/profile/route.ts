import { NextResponse } from "next/server"
import * as z from "zod"

import {
  getUserProfileSettings,
  updateUserProfileSettings,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

const VALID_THEMES = ["midnight", "dark", "light", "emerald", "amber", "rose"] as const
const VALID_LOCALES = ["pt-BR", "en-US"] as const

const profileSchema = z.object({
  display_name: z.string().trim().max(80, "Nome deve ter no máximo 80 caracteres").optional(),
  avatar_url: z.string().trim().url("URL da imagem inválida").nullable().optional(),
  theme: z.enum(VALID_THEMES).nullable().optional(),
  locale: z.enum(VALID_LOCALES).nullable().optional(),
})

function defaultNameFromEmail(email: string | null | undefined) {
  if (!email) return "Usuário"
  const [localPart] = email.split("@")
  return localPart || "Usuário"
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const settings = await getUserProfileSettings(authData.user.id)
    const email = authData.user.email ?? null
    const displayName = settings?.display_name?.trim() || defaultNameFromEmail(email)

    return NextResponse.json({
      ok: true,
      profile: {
        email,
        display_name: displayName,
        avatar_url: settings?.avatar_url ?? null,
        theme: settings?.theme ?? null,
        locale: settings?.locale ?? null,
        lgpd_consent_at: settings?.lgpd_consent_at ?? null,
        lgpd_consent_version: settings?.lgpd_consent_version ?? null,
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar perfil." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = profileSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const email = authData.user.email ?? null
    const incomingDisplayName =
      parsed.data.display_name !== undefined
        ? parsed.data.display_name.trim() || defaultNameFromEmail(email)
        : undefined

    await updateUserProfileSettings(authData.user.id, {
      displayName: incomingDisplayName,
      avatarUrl: parsed.data.avatar_url,
      theme: parsed.data.theme,
      locale: parsed.data.locale,
    })

    const settings = await getUserProfileSettings(authData.user.id)

    return NextResponse.json({
      ok: true,
      profile: {
        email,
        display_name: settings?.display_name?.trim() || defaultNameFromEmail(email),
        avatar_url: settings?.avatar_url ?? null,
        theme: settings?.theme ?? null,
        locale: settings?.locale ?? null,
        lgpd_consent_at: settings?.lgpd_consent_at ?? null,
        lgpd_consent_version: settings?.lgpd_consent_version ?? null,
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar perfil." }, { status: 500 })
  }
}
