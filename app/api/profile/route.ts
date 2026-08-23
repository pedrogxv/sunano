import { NextResponse } from "next/server"
import * as z from "zod"

import { coerceAccountTier } from "@/lib/account-tier"
import { checkContent, CONTENT_FILTER_MESSAGE } from "@/lib/content-filter"
import { dbErrorResponse } from "@/lib/db-errors"
import { coerceMediaAdjustments, DEFAULT_ADJUSTMENTS } from "@/lib/profile-media-adjust"
import { slugifyDisplayName } from "@/lib/profile-name"
import { BIO_MAX_LENGTH, normalizeSocialHandle, SOCIAL_HANDLE_PATTERN } from "@/lib/profile-showcase"
import {
  getAdminProfileSummary,
  getUserProfileSettings,
  resolveAvailableDisplayName,
  updateUserProfileSettings,
} from "@/lib/server/repositories/users-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

const VALID_THEMES = ["dark", "light"] as const
const VALID_LOCALES = ["pt-BR", "en-US"] as const

const profileSchema = z.object({
  // display_name REMOVIDO — trocar nome agora é só via
  // POST /api/aura/display-name (change_display_name_with_aura), pago com
  // Aura e sujeito a cooldown de 3 dias. Este endpoint nunca mais aceita
  // esse campo; o nome inicial (conta nova) continua sendo resolvido
  // internamente a partir do e-mail, sem input do usuário (ver `seedName`
  // abaixo).
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
  // Aceita handle solto ("@user") ou URL colada — normalizado abaixo antes de salvar.
  youtube_handle: z.string().trim().max(200).nullable().optional(),
  tiktok_handle: z.string().trim().max(200).nullable().optional(),
  // Enquadramento das imagens. O schema só exige "é um objeto": faixa e
  // arredondamento ficam com `coerceMediaAdjustments`, que é o mesmo código
  // que o editor usa no client — assim os dois nunca discordam sobre o que é
  // um valor válido.
  media_adjustments: z.record(z.string(), z.unknown()).optional(),
})

/** Normaliza e valida um handle de rede social. Retorna `undefined` (sem mudança), `null` (limpar) ou o handle válido. */
function parseSocialHandle(
  raw: string | null | undefined
): { value: string | null | undefined; error: string | null } {
  if (raw === undefined) return { value: undefined, error: null }
  if (raw === null || raw.trim() === "") return { value: null, error: null }
  const normalized = normalizeSocialHandle(raw)
  if (!SOCIAL_HANDLE_PATTERN.test(normalized)) {
    return { value: undefined, error: "Use apenas letras, números, ponto, hífen ou underscore." }
  }
  return { value: normalized, error: null }
}

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
        vip_expires_at: settings?.vip_expires_at ?? null,
        youtube_handle: settings?.youtube_handle ?? null,
        tiktok_handle: settings?.tiktok_handle ?? null,
        media_adjustments: settings?.media_adjustments ?? DEFAULT_ADJUSTMENTS,
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
    const existingSettings = await getUserProfileSettings(authData.user.id)

    if (parsed.data.bio && checkContent(parsed.data.bio).blocked) {
      return NextResponse.json({ error: CONTENT_FILTER_MESSAGE, field: "bio" }, { status: 400 })
    }

    const youtubeHandle = parseSocialHandle(parsed.data.youtube_handle)
    if (youtubeHandle.error) {
      return NextResponse.json({ error: youtubeHandle.error, field: "youtube_handle" }, { status: 400 })
    }
    const tiktokHandle = parseSocialHandle(parsed.data.tiktok_handle)
    if (tiktokHandle.error) {
      return NextResponse.json({ error: tiktokHandle.error, field: "tiktok_handle" }, { status: 400 })
    }

    // Perfil que ainda não existe (conta antiga, ou primeira mudança de tema
    // antes de qualquer edição) nasce com um nome derivado do email em vez do
    // `user-<id>` que o banco geraria como fallback. Perfil já existente nunca
    // tem o nome tocado por este endpoint — trocar nome é só via
    // POST /api/aura/display-name.
    const seedName = !existingSettings
      ? await resolveAvailableDisplayName(defaultNameFromEmail(email), authData.user.id)
      : undefined

    await updateUserProfileSettings(authData.user.id, {
      displayName: seedName,
      avatarUrl: parsed.data.avatar_url,
      theme: parsed.data.theme,
      locale: parsed.data.locale,
      bannerUrl: parsed.data.banner_url,
      miniBannerUrl: parsed.data.mini_banner_url,
      // Bio vazia é limpeza do campo, não string vazia no banco.
      bio: parsed.data.bio === undefined ? undefined : parsed.data.bio || null,
      youtubeHandle: youtubeHandle.value,
      tiktokHandle: tiktokHandle.value,
      mediaAdjustments:
        parsed.data.media_adjustments === undefined
          ? undefined
          : coerceMediaAdjustments(parsed.data.media_adjustments),
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
        vip_expires_at: settings?.vip_expires_at ?? null,
        youtube_handle: settings?.youtube_handle ?? null,
        tiktok_handle: settings?.tiktok_handle ?? null,
        media_adjustments: settings?.media_adjustments ?? DEFAULT_ADJUSTMENTS,
      },
    })
  } catch (err) {
    // Corrida entre dois cadastros do mesmo nome: quem perder cai no 23505 do
    // índice único e recebe 409 com mensagem específica.
    const { body, status } = dbErrorResponse(err, "Erro ao salvar perfil.")
    return NextResponse.json(body, { status })
  }
}
