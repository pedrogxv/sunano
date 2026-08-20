import { NextResponse } from "next/server"
import * as z from "zod"

import { hasAdminPermission, type AdminProfile } from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { countSupportTicketsAwaitingAdmin } from "@/lib/server/repositories/support-repository"

const profileSchema = z.object({
  display_name: z.string().trim().max(80, "Nome deve ter no máximo 80 caracteres").optional(),
  avatar_url: z.string().trim().url("URL da imagem inválida").nullable().optional(),
})

function defaultNameFromEmail(email: string | null | undefined) {
  if (!email) return "Admin"
  const [localPart] = email.split("@")
  return localPart || "Admin"
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from("admin_profiles")
      .select("id, email, display_name, avatar_url, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    if (error) {
      const { body, status } = dbErrorResponse(error, "Erro ao carregar perfil.")
      return NextResponse.json(body, { status })
    }

    const typedProfile = profile as AdminProfile | null
    const email = typedProfile?.email ?? authData.user.email ?? null
    const displayName = typedProfile?.display_name?.trim() || defaultNameFromEmail(email)

    // Alimenta o badge de "Suporte" da sidebar sem nenhum fetch novo — a
    // sidebar já busca este endpoint uma vez no mount (ver AdminSidebar.tsx).
    const supportAwaitingCount = hasAdminPermission(typedProfile, "support_read")
      ? await countSupportTicketsAwaitingAdmin()
      : 0

    return NextResponse.json({
      ok: true,
      profile: {
        id: authData.user.id,
        email,
        display_name: displayName,
        avatar_url: typedProfile?.avatar_url ?? null,
        role: typedProfile?.role ?? "admin",
        permissions: typedProfile?.permissions ?? {},
      },
      supportAwaitingCount,
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
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    const { data: currentProfile } = await supabase
      .from("admin_profiles")
      .select("id, email, display_name, avatar_url, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    if (!currentProfile) {
      return NextResponse.json({ error: "Perfil administrativo não encontrado." }, { status: 403 })
    }

    const typedCurrentProfile = currentProfile as AdminProfile

    if (!hasAdminPermission(typedCurrentProfile, "profile_write")) {
      return NextResponse.json({ error: "Sem permissão para editar o perfil." }, { status: 403 })
    }

    const email = authData.user.email ?? null
    const incomingDisplayName = parsed.data.display_name?.trim() || null
    const displayName = incomingDisplayName || defaultNameFromEmail(email)

    const payload = {
      id: authData.user.id,
      email,
      display_name: displayName,
      avatar_url: parsed.data.avatar_url?.trim() || null,
      role: typedCurrentProfile.role,
      permissions: typedCurrentProfile.permissions,
    }

    const { error } = await supabase.from("admin_profiles").upsert(
      payload as any,
      {
        onConflict: "id",
      },
    )

    if (error) {
      const { body, status } = dbErrorResponse(error, "Erro ao salvar perfil.")
      return NextResponse.json(body, { status })
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: authData.user.id,
        email,
        display_name: displayName,
        avatar_url: parsed.data.avatar_url?.trim() || null,
        role: typedCurrentProfile.role,
        permissions: typedCurrentProfile.permissions ?? {},
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar perfil." }, { status: 500 })
  }
}
