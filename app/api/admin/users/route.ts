import { NextResponse } from "next/server"
import * as z from "zod"

import {
  ADMIN_ROLE_ORDER,
  type AdminProfile,
  type AdminRole,
  getRolePermissions,
  isWebMaster,
} from "@/lib/admin-permissions"
import { dbErrorResponse } from "@/lib/db-errors"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  ADMIN_USER_SORTS,
  ADMIN_USER_STATUSES,
  getAdminUserStats,
  listAdminUsersPaginated,
  type AdminUserSort,
  type AdminUserStatus,
} from "@/lib/server/repositories/users-repository"

const userUpdateSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().max(80).optional(),
  avatar_url: z.string().trim().url().nullable().optional(),
  // "user" representa um usuário comum (sem linha em admin_profiles).
  role: z.enum(["user", "webmaster", "admin", "moderator", "editor", "vendedor", "suporte"]).optional(),
  // Só aceito para quem não tem cargo: com cargo, o VIP é automático e não editável.
  account_tier: z.enum(["common", "vip"]).optional(),
  // "Pacote Loja": libera Loja + Programa de Afiliados para este usuário mesmo
  // com STORE_MAINTENANCE_MODE=true. Independente de cargo e de VIP — é só um
  // bypass da manutenção, não dá nenhum outro privilégio.
  store_access: z.boolean().optional(),
})

const userCreateSchema = z.object({
  email: z.string().trim().email(),
  display_name: z.string().trim().max(80).optional(),
  // Web Master não é atribuível na criação: exige a promoção com confirmação dedicada.
  role: z.enum(["admin", "moderator", "editor", "vendedor", "suporte"]).optional(),
})

function defaultNameFromEmail(email: string | null | undefined) {
  if (!email) return "Usuário"
  const [localPart] = email.split("@")
  return localPart || "Usuário"
}

function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

/**
 * Listagem paginada de usuários.
 *
 * Antes esta rota varria `auth.users` de 1000 em 1000 até o fim, lia
 * `admin_profiles` e `user_profiles` inteiras, juntava tudo em memória e
 * devolvia o array completo — a tela não tinha paginação nenhuma. Busca,
 * filtro e ordenação agora vivem no banco (RPC `admin_list_users`) e só uma
 * página trafega.
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)

    const roleParam = searchParams.get("role") ?? "all"
    const role = roleParam === "all" || roleParam === "user" || ADMIN_ROLE_ORDER.includes(roleParam as AdminRole)
      ? roleParam
      : "all"

    const statusParam = searchParams.get("status") as AdminUserStatus | null
    const status = statusParam && ADMIN_USER_STATUSES.includes(statusParam) ? statusParam : "all"

    const sortParam = searchParams.get("sort") as AdminUserSort | null
    const sort = sortParam && ADMIN_USER_SORTS.includes(sortParam) ? sortParam : "recent"

    const pageParam = Number(searchParams.get("page"))
    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.trunc(pageParam) : 1

    const pageSizeParam = Number(searchParams.get("pageSize"))
    const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.trunc(pageSizeParam) : 24

    // Os contadores descrevem a base inteira, então não acompanham o filtro.
    // Só são recalculados quando o cliente pede (primeira carga e após uma
    // escrita) — virar de página não precisa deles.
    const wantStats = searchParams.get("stats") !== "0"

    const [list, stats] = await Promise.all([
      listAdminUsersPaginated({
        search: searchParams.get("search"),
        role,
        status,
        sort,
        page,
        pageSize,
      }),
      wantStats ? getAdminUserStats() : Promise.resolve(null),
    ])

    const users = list.users.map((u) => ({
      ...u,
      permissions: getRolePermissions(u.role as AdminRole | "user"),
    }))

    return NextResponse.json({
      ok: true,
      current_user_id: authData.user.id,
      // O cargo de quem está olhando não pode sair da página listada: com
      // paginação o próprio WEB Master quase nunca está nela, e a UI usa isto
      // pra liberar banir/excluir/logar-como.
      current_user_role: typedCurrentProfile.role,
      users,
      total: list.total,
      page,
      pageSize,
      ...(stats ? { stats } : {}),
    })
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

    // O WEB Master e o próprio usuário têm cargo (e, por consequência, permissões) protegidos.
    if ((isTargetCurrentUser || isTargetWebMaster) && (parsed.data.role !== undefined || parsed.data.account_tier !== undefined)) {
      return NextResponse.json(
        { error: "As permissões do WEB Master não podem ser alteradas." },
        { status: 403 }
      )
    }

    const ipAddress = getClientIp(request)

    // ── "Pacote Loja" (Loja + Programa de Afiliados) ──
    // Tratado ANTES dos branches de cargo, e não dentro deles, porque é
    // ortogonal a cargo e a VIP: é só um bypass de STORE_MAINTENANCE_MODE. Sem
    // isto, um PATCH que mande só `store_access` cairia num branch que retorna
    // cedo sem gravar nada.
    if (parsed.data.store_access !== undefined) {
      // Outro WEB Master já fura a manutenção pelo cargo — o flag não teria
      // efeito e só criaria estado contraditório. A própria conta também fica
      // de fora, espelhando as outras travas desta rota.
      if (isTargetWebMaster || isTargetCurrentUser) {
        return NextResponse.json(
          { error: "O WEB Master já tem acesso completo à Loja e aos Afiliados." },
          { status: 400 }
        )
      }

      const { error: storeAccessError } = await admin
        .from("user_profiles")
        .update({ store_access: parsed.data.store_access })
        .eq("id", parsed.data.id)
      if (storeAccessError) {
        const { body, status } = dbErrorResponse(storeAccessError, "Erro ao atualizar o acesso à Loja.")
        return NextResponse.json(body, { status })
      }

      // Auditável: é uma concessão de acesso a um fluxo que move dinheiro
      // (pedidos e comissão de afiliado), então fica registrada igual às
      // mudanças de cargo.
      await admin.from("audit_log").insert({
        user_id: parsed.data.id,
        actor_id: authData.user.id,
        action: parsed.data.store_access ? "store_access_granted" : "store_access_revoked",
        table_name: "user_profiles",
        record_id: parsed.data.id,
        metadata: { store_access: parsed.data.store_access },
        ip_address: ipAddress,
      })

      // Pedido que só mexe no pacote Loja termina aqui — nada de cargo/VIP
      // para processar abaixo.
      if (
        parsed.data.role === undefined &&
        parsed.data.account_tier === undefined &&
        parsed.data.display_name === undefined &&
        parsed.data.avatar_url === undefined
      ) {
        return NextResponse.json({ ok: true })
      }
    }

    // Rebaixar para usuário comum: remove a linha de admin_profiles. Sem cargo,
    // o VIP passa a ser controlável manualmente.
    if (parsed.data.role === "user") {
      if (typedTargetProfile) {
        const { error } = await admin.from("admin_profiles").delete().eq("id", parsed.data.id)
        if (error) {
          const { body, status } = dbErrorResponse(error, "Erro ao atualizar usuário.")
          return NextResponse.json(body, { status })
        }
        await admin.from("audit_log").insert({
          user_id: parsed.data.id,
          actor_id: authData.user.id,
          action: "admin_role_changed",
          table_name: "admin_profiles",
          record_id: parsed.data.id,
          metadata: {
            previous_role: typedTargetProfile.role,
            new_role: "user",
            previous_permissions: typedTargetProfile.permissions,
            new_permissions: null,
          },
          ip_address: ipAddress,
        })
      }
      if (parsed.data.account_tier !== undefined) {
        const { error: tierError } = await admin
          .from("user_profiles")
          .update({ account_tier: parsed.data.account_tier })
          .eq("id", parsed.data.id)
        if (tierError) {
          const { body, status } = dbErrorResponse(tierError, "Erro ao atualizar tier do usuário.")
          return NextResponse.json(body, { status })
        }
      }
      return NextResponse.json({ ok: true })
    }

    const nextRole = parsed.data.role ?? typedTargetProfile?.role
    if (!nextRole) {
      // Usuário comum sem mudança de cargo: VIP é controlável manualmente.
      if (parsed.data.account_tier !== undefined) {
        const { error: tierError } = await admin
          .from("user_profiles")
          .update({ account_tier: parsed.data.account_tier })
          .eq("id", parsed.data.id)
        if (tierError) {
          const { body, status } = dbErrorResponse(tierError, "Erro ao atualizar tier do usuário.")
          return NextResponse.json(body, { status })
        }
      }
      return NextResponse.json({ ok: true })
    }

    // Usuário com cargo: VIP é automático, não editável manualmente.
    if (parsed.data.account_tier !== undefined) {
      return NextResponse.json(
        { error: "VIP é automático para usuários com cargo e não pode ser alterado manualmente." },
        { status: 400 }
      )
    }

    // Todo cargo (exceto Usuário) garante VIP automaticamente — não editável
    // manualmente. Só eleva de "common" pra "vip" (não mexe em quem já é vip).
    if (parsed.data.role !== undefined) {
      const { error: tierError } = await admin
        .from("user_profiles")
        .update({ account_tier: "vip" })
        .eq("id", parsed.data.id)
        .eq("account_tier", "common")
      if (tierError) {
        const { body, status } = dbErrorResponse(tierError, "Erro ao atualizar tier do usuário.")
        return NextResponse.json(body, { status })
      }
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
      // Permissões vêm 100% do cargo — a coluna só espelha a matriz para quem lê direto do banco.
      permissions: getRolePermissions(nextRole),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await admin.from("admin_profiles").upsert(payload as any, { onConflict: "id" })

    if (error) {
      const { body, status } = dbErrorResponse(error, "Erro ao atualizar usuário.")
      return NextResponse.json(body, { status })
    }

    if (parsed.data.role !== undefined) {
      await admin.from("audit_log").insert({
        user_id: parsed.data.id,
        actor_id: authData.user.id,
        action: "admin_role_changed",
        table_name: "admin_profiles",
        record_id: parsed.data.id,
        metadata: {
          previous_role: typedTargetProfile?.role ?? "user",
          new_role: nextRole,
          previous_permissions: typedTargetProfile?.permissions ?? null,
          new_permissions: payload.permissions,
        },
        ip_address: ipAddress,
      })
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

    const payload = {
      id: invitedUser.user.id,
      email: parsed.data.email,
      display_name: displayName,
      avatar_url: null,
      role,
      permissions: getRolePermissions(role),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adminClient.from("admin_profiles").upsert(payload as any, { onConflict: "id" })

    if (error) {
      const { body, status } = dbErrorResponse(error, "Erro ao criar usuário.")
      return NextResponse.json(body, { status })
    }

    // Todo cargo (exceto Usuário) garante VIP automaticamente — inclusive
    // quem acabou de ganhar um cargo administrativo.
    const { error: tierError } = await adminClient
      .from("user_profiles")
      .update({ account_tier: "vip" })
      .eq("id", invitedUser.user.id)
      .eq("account_tier", "common")
    if (tierError) {
      const { body, status } = dbErrorResponse(tierError, "Erro ao atualizar tier do usuário.")
      return NextResponse.json(body, { status })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao criar usuário." }, { status: 500 })
  }
}