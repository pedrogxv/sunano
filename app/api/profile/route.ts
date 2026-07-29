import { NextResponse } from "next/server"
import * as z from "zod"

import { coerceAccountTier } from "@/lib/account-tier"
import { dbErrorResponse } from "@/lib/db-errors"
import { DISPLAY_NAME_MAX_LENGTH, slugifyDisplayName, validateDisplayName } from "@/lib/profile-name"
import { BIO_MAX_LENGTH } from "@/lib/profile-showcase"
import {
  getAdminProfileSummary,
  getUserProfileSettings,
  isDisplayNameAvailable,
  resolveAvailableDisplayName,
  updateUserProfileSettings,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

const VALID_THEMES = ["dark", "light"] as const
const VALID_LOCALES = ["pt-BR", "en-US"] as const

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(DISPLAY_NAME_MAX_LENGTH, `Nome deve ter no máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres`)
    .optional(),
  avatar_url: z.string().trim().url("URL da imagem inválida").nullable().optional(),
  theme: z.enum(VALID_THEMES).nullable().optional(),
  locale: z.enum(VALID_LOCALES).nullable().optional(),
  banner_url: z.string().trim().url("URL do banner inválida").nullable().optional(),
  mini_banner_url: z.string().trim().url("URL do mini banner inválida").nullable().optional(),
  bio: z
    .string()
    .trim()
    .max(BIO_MAX_LENGTH, `Bio deve ter no máximo ${BIO_MAX_LENGTH} caracteres`)
    .nullable()
    .optional(),
})

function defaultNameFromEmail(email: string | null | undefined) {
  if (!email) return "Usuário"
  const [localPart] = email.split("@")
  return localPart || "Usuário"
}

/**
 * Foto que a página de perfil exibe.
 *
 * A de `user_profiles` manda — é a que o próprio usuário envia aqui. Quando
 * ela ainda não existe, cai nas mesmas fontes que a sidebar já usa (perfil
 * admin e metadados do login social): sem isso o editor jura que a pessoa
 * não tem foto enquanto o resto do site exibe uma.
 */
function resolveAvatarUrl(
  settingsAvatar: string | null | undefined,
  adminAvatar: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (settingsAvatar) return settingsAvatar
  if (adminAvatar) return adminAvatar
  const fromLogin = metadata?.avatar_url ?? metadata?.picture
  return typeof fromLogin === "string" && fromLogin ? fromLogin : null
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const [settings, adminProfile] = await Promise.all([
      getUserProfileSettings(authData.user.id),
      getAdminProfileSummary(authData.user.id),
    ])
    const email = authData.user.email ?? null
    const displayName = settings?.display_name?.trim() || defaultNameFromEmail(email)

    return NextResponse.json({
      ok: true,
      profile: {
        id: authData.user.id,
        email,
        display_name: displayName,
        display_slug: settings?.display_slug ?? slugifyDisplayName(displayName),
        avatar_url: resolveAvatarUrl(
          settings?.avatar_url,
          adminProfile?.avatar_url,
          authData.user.user_metadata
        ),
        theme: settings?.theme ?? null,
        locale: settings?.locale ?? null,
        lgpd_consent_at: settings?.lgpd_consent_at ?? null,
        lgpd_consent_version: settings?.lgpd_consent_version ?? null,
        banner_url: settings?.banner_url ?? null,
        mini_banner_url: settings?.mini_banner_url ?? null,
        bio: settings?.bio ?? null,
        account_tier: coerceAccountTier(settings?.account_tier),
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

    if (incomingDisplayName !== undefined) {
      const invalid = validateDisplayName(incomingDisplayName)
      if (invalid) {
        return NextResponse.json({ error: invalid, field: "display_name" }, { status: 400 })
      }
      // Checagem amigável antes do índice único do banco, que também barra —
      // aqui a mensagem sai específica em vez de "erro ao salvar".
      const available = await isDisplayNameAvailable(incomingDisplayName, authData.user.id)
      if (!available) {
        return NextResponse.json(
          { error: "Esse nome já está em uso. Escolha outro.", field: "display_name" },
          { status: 409 }
        )
      }
    }

    // Perfil que ainda não existe (conta antiga, ou primeira mudança de tema
    // antes de qualquer edição) nasce com um nome derivado do email em vez do
    // `user-<id>` que o banco geraria como fallback.
    const seedName =
      incomingDisplayName === undefined && !(await getUserProfileSettings(authData.user.id))
        ? await resolveAvailableDisplayName(defaultNameFromEmail(email), authData.user.id)
        : undefined

    await updateUserProfileSettings(authData.user.id, {
      displayName: incomingDisplayName ?? seedName,
      avatarUrl: parsed.data.avatar_url,
      theme: parsed.data.theme,
      locale: parsed.data.locale,
      bannerUrl: parsed.data.banner_url,
      miniBannerUrl: parsed.data.mini_banner_url,
      // Bio vazia é limpeza do campo, não string vazia no banco.
      bio: parsed.data.bio === undefined ? undefined : parsed.data.bio || null,
    })

    const [settings, adminProfile] = await Promise.all([
      getUserProfileSettings(authData.user.id),
      getAdminProfileSummary(authData.user.id),
    ])

    return NextResponse.json({
      ok: true,
      profile: {
        id: authData.user.id,
        email,
        display_name: settings?.display_name?.trim() || defaultNameFromEmail(email),
        display_slug: settings?.display_slug ?? null,
        avatar_url: resolveAvatarUrl(
          settings?.avatar_url,
          adminProfile?.avatar_url,
          authData.user.user_metadata
        ),
        theme: settings?.theme ?? null,
        locale: settings?.locale ?? null,
        lgpd_consent_at: settings?.lgpd_consent_at ?? null,
        lgpd_consent_version: settings?.lgpd_consent_version ?? null,
        banner_url: settings?.banner_url ?? null,
        mini_banner_url: settings?.mini_banner_url ?? null,
        bio: settings?.bio ?? null,
        account_tier: coerceAccountTier(settings?.account_tier),
      },
    })
  } catch (err) {
    // Corrida entre dois cadastros do mesmo nome: quem perder cai no 23505 do
    // índice único e recebe 409 com mensagem específica.
    const { body, status } = dbErrorResponse(err, "Erro ao salvar perfil.")
    return NextResponse.json(body, { status })
  }
}
