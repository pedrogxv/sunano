import { NextResponse } from "next/server"
import * as z from "zod"

import {
  createDefaultPermissions,
  createFullPermissions,
  type AdminProfile,
  isWebMaster,
  normalizePermissions,
} from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

type AdminProfileRow = AdminProfile & {
  created_at: string
  updated_at: string
}

const userUpdateSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().max(80).optional(),
  avatar_url: z.string().trim().url().nullable().optional(),
  // "user" representa um usuário comum (sem linha em admin_profiles).
  role: z.enum(["user", "admin", "moderator", "webmaster"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
})

const userCreateSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().max(80).optional(),
  role: z.enum(["admin", "moderator"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
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

    // Lista TODOS os usuários cadastrados (auth.users) e combina com os perfis
    // administrativos e públicos. Quem não tem linha em admin_profiles é um
    // usuário comum (role "user"). Usa o admin client (service role) para
    // enxergar todas as linhas, sem depender de RLS.
    const admin = createSupabaseAdminClient()

    const authUsers: { id: string; email: string | null; created_at: string }[] = []
    for (let page = 1; ; page++) {
      const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (listError) {
        return NextResponse.json({ error: "Erro ao listar usuários." }, { status: 500 })
      }
      authUsers.push(
        ...pageData.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at }))
      )
      if (pageData.users.length < 1000) break
    }

    const [{ data: adminRows }, { data: profileRows }] = await Promise.all([
      admin.from("admin_profiles").select("id, email, display_name, avatar_url, role, permissions, updated_at"),
      admin.from("user_profiles").select("id, display_name, avatar_url"),
    ])

    const adminMap = new Map<string, AdminProfileRow>()
    for (const row of (adminRows ?? []) as AdminProfileRow[]) adminMap.set(row.id, row)
    const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>()
    for (const row of (profileRows ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
      profileMap.set(row.id, { display_name: row.display_name, avatar_url: row.avatar_url })
    }

    const users = authUsers
      .map((u) => {
        const ap = adminMap.get(u.id)
        const up = profileMap.get(u.id)
        const role = ap?.role ?? "user"
        const email = u.email ?? ap?.email ?? null
        return {
          id: u.id,
          email,
          display_name: ap?.display_name?.trim() || up?.display_name?.trim() || defaultNameFromEmail(email),
          avatar_url: ap?.avatar_url ?? up?.avatar_url ?? null,
          role,
          permissions:
            role === "webmaster"
              ? createFullPermissions()
              : role === "user"
                ? {}
                : normalizePermissions(ap?.permissions as Record<string, boolean> | null),
          created_at: u.created_at,
          updated_at: ap?.updated_at ?? u.created_at,
        }
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at))

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

    // Escritas usam o admin client (service role): a autorização já foi
    // garantida acima (isWebMaster), e assim não dependemos de RLS — que antes
    // bloqueava o WEB Master de editar outros usuários (erro 42501).
    const admin = createSupabaseAdminClient()

    const { data: targetProfile } = await admin
      .from("admin_profiles")
      .select("id, email, display_name, avatar_url, role, permissions")
      .eq("id", parsed.data.id)
      .maybeSingle()

    const typedTargetProfile = targetProfile as AdminProfile | null

    const isTargetWebMaster = typedTargetProfile?.role === "webmaster"
    const isTargetCurrentUser = parsed.data.id === authData.user.id

    // O WEB Master e o próprio usuário têm cargo/permissões protegidos.
    if ((isTargetCurrentUser || isTargetWebMaster) && (parsed.data.role !== undefined || parsed.data.permissions !== undefined)) {
      return NextResponse.json(
        { error: "As permissões do WEB Master não podem ser alteradas." },
        { status: 403 }
      )
    }

    // Rebaixar para usuário comum: remove a linha de admin_profiles.
    if (parsed.data.role === "user") {
      if (typedTargetProfile) {
        const { error } = await admin.from("admin_profiles").delete().eq("id", parsed.data.id)
        if (error) {
          const { body, status } = dbErrorResponse(error, "Erro ao atualizar usuário.")
          return NextResponse.json(body, { status })
        }
      }
      return NextResponse.json({ ok: true })
    }

    const nextRole = parsed.data.role ?? typedTargetProfile?.role
    if (!nextRole) {
      // Usuário comum sem mudança de cargo: nada a persistir em admin_profiles.
      return NextResponse.json({ ok: true })
    }

    // Resolve identificação do alvo (que pode ainda não ter admin_profiles).
    let targetEmail = typedTargetProfile?.email ?? null
    let fallbackDisplay = typedTargetProfile?.display_name ?? null
    let fallbackAvatar = typedTargetProfile?.avatar_url ?? null
    if (!typedTargetProfile) {
      const { data: authUser } = await admin.auth.admin.getUserById(parsed.data.id)
      if (!authUser?.user) {
        return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
      }
      targetEmail = authUser.user.email ?? null
      const { data: up } = await admin
        .from("user_profiles")
        .select("display_name, avatar_url")
        .eq("id", parsed.data.id)
        .maybeSingle()
      const typedUp = up as { display_name: string | null; avatar_url: string | null } | null
      fallbackDisplay = typedUp?.display_name ?? null
      fallbackAvatar = typedUp?.avatar_url ?? null
    }

    const payload = {
      id: parsed.data.id,
      email: targetEmail,
      display_name: parsed.data.display_name?.trim() || fallbackDisplay?.trim() || defaultNameFromEmail(targetEmail),
      avatar_url: parsed.data.avatar_url ?? fallbackAvatar ?? null,
      role: nextRole,
      permissions:
        nextRole === "webmaster"
          ? createFullPermissions()
          : parsed.data.permissions
            ? normalizePermissions(parsed.data.permissions)
            : typedTargetProfile?.permissions ?? createDefaultPermissions(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await admin.from("admin_profiles").upsert(payload as any, { onConflict: "id" })

    if (error) {
      const { body, status } = dbErrorResponse(error, "Erro ao atualizar usuário.")
      return NextResponse.json(body, { status })
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
      const message = inviteError?.message ?? ""
      const friendly = /already.*registered|already.*invited|exists/i.test(message)
        ? "Já existe um usuário com este email."
        : "Falha ao convidar usuário. Verifique se o email está correto e tente novamente."
      return NextResponse.json({ error: friendly }, { status: 400 })
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adminClient.from("admin_profiles").upsert(payload as any, { onConflict: "id" })

    if (error) {
      const { body, status } = dbErrorResponse(error, "Erro ao criar usuário.")
      return NextResponse.json(body, { status })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar usuário." }, { status: 500 })
  }
}