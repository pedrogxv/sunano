import { NextResponse } from "next/server"
import * as z from "zod"

import {
  createDefaultPermissions,
  createFullPermissions,
  type AdminProfile,
  isWebMaster,
  normalizePermissions,
} from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { createSupabaseServerClient } from "@/lib/supabase-server"

type AdminProfileRow = AdminProfile & {
  created_at: string
  updated_at: string
}

const userUpdateSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().max(80).optional(),
  avatar_url: z.string().trim().url().nullable().optional(),
  role: z.enum(["admin", "moderator", "webmaster"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
})

const userCreateSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().max(80).optional(),
  role: z.enum(["admin", "moderator"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
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

    const { data: currentProfile } = await supabase
      .from("admin_profiles")
      .select("id, email, display_name, avatar_url, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    const typedCurrentProfile = currentProfile as AdminProfile | null

    if (!typedCurrentProfile || !isWebMaster(typedCurrentProfile)) {
      return NextResponse.json({ error: "Apenas o WEB Master pode ver usuários." }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("admin_profiles")
      .select("id, email, display_name, avatar_url, role, permissions, created_at, updated_at")
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const users = ((data ?? []) as AdminProfileRow[]).map((item) => ({
      id: item.id,
      email: item.email,
      display_name: item.display_name?.trim() || defaultNameFromEmail(item.email),
      avatar_url: item.avatar_url,
      role: item.role,
      permissions: item.role === "webmaster" ? createFullPermissions() : normalizePermissions(item.permissions as Record<string, boolean> | null),
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))

    return NextResponse.json({ ok: true, current_user_id: authData.user.id, users })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar usuários." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const parsed = userUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    const { data: currentProfile } = await supabase
      .from("admin_profiles")
      .select("id, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    const typedCurrentProfile = currentProfile as AdminProfile | null

    if (!typedCurrentProfile || !isWebMaster(typedCurrentProfile)) {
      return NextResponse.json({ error: "Apenas o WEB Master pode alterar usuários." }, { status: 403 })
    }

    const { data: targetProfile } = await supabase
      .from("admin_profiles")
      .select("id, email, display_name, avatar_url, role, permissions")
      .eq("id", parsed.data.id)
      .maybeSingle()

    const typedTargetProfile = targetProfile as AdminProfile | null

    if (!typedTargetProfile) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
    }

    const isTargetWebMaster = typedTargetProfile.role === "webmaster"
    const isTargetCurrentUser = typedTargetProfile.id === authData.user.id

    if ((isTargetCurrentUser || isTargetWebMaster) && (parsed.data.role !== undefined || parsed.data.permissions !== undefined)) {
      return NextResponse.json(
        { error: "As permissões do WEB Master não podem ser alteradas." },
        { status: 403 }
      )
    }

    const payload = {
      id: parsed.data.id,
      email: typedTargetProfile.email ?? authData.user.email ?? null,
      display_name: parsed.data.display_name?.trim() || typedTargetProfile.display_name?.trim() || defaultNameFromEmail(typedTargetProfile.email ?? authData.user.email),
      avatar_url: parsed.data.avatar_url ?? typedTargetProfile.avatar_url ?? null,
      role: parsed.data.role ?? typedTargetProfile.role,
      permissions:
        parsed.data.role === "webmaster"
          ? createFullPermissions()
          : parsed.data.permissions
            ? normalizePermissions(parsed.data.permissions)
            : typedTargetProfile.permissions ?? {},
    }

    const { error } = await supabase.from("admin_profiles").upsert(payload as any, { onConflict: "id" })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar usuário." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = userCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente no admin." }, { status: 401 })
    }

    const { data: currentProfile } = await supabase
      .from("admin_profiles")
      .select("id, role, permissions")
      .eq("id", authData.user.id)
      .maybeSingle()

    const typedCurrentProfile = currentProfile as AdminProfile | null

    if (!typedCurrentProfile || !isWebMaster(typedCurrentProfile)) {
      return NextResponse.json({ error: "Apenas o WEB Master pode criar usuários." }, { status: 403 })
    }

    const adminClient = createSupabaseAdminClient()
    const displayName = parsed.data.display_name?.trim() || defaultNameFromEmail(parsed.data.email)

    const { data: invitedUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      parsed.data.email,
      {
        data: {
          display_name: displayName,
        },
      }
    )

    if (inviteError || !invitedUser?.user) {
      return NextResponse.json({ error: inviteError?.message ?? "Falha ao convidar usuário." }, { status: 400 })
    }

    const role = parsed.data.role ?? "admin"
    const permissions = parsed.data.permissions
      ? normalizePermissions(parsed.data.permissions)
      : createDefaultPermissions()

    const payload = {
      id: invitedUser.user.id,
      email: parsed.data.email,
      display_name: displayName,
      avatar_url: null,
      role,
      permissions,
    }

    const { error } = await adminClient.from("admin_profiles").upsert(payload as any, { onConflict: "id" })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar usuário." }, { status: 500 })
  }
}