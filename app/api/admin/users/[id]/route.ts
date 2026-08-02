import { NextResponse } from "next/server"

import { isWebMaster } from "@/lib/admin-permissions"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { deleteUserAsAdmin } from "@/lib/server/repositories/users-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

/**
 * Exclusão de usuário — exclusiva do WEB Master, sem exceções.
 *
 * Nunca confie no cliente para essa checagem: mesmo que a tela só mostre o
 * botão para o WEB Master, a autorização é refeita aqui do zero a cada
 * chamada, lendo o cargo do banco pela sessão autenticada. Um WEB Master não
 * pode excluir a própria conta nem a de outro WEB Master por este painel
 * (evita lockout e disputa entre WEB Masters).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: targetId } = await params

    if (!targetId) {
      return NextResponse.json({ error: "ID do usuário não informado." }, { status: 400 })
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

    if (!currentProfile || !isWebMaster(currentProfile)) {
      return NextResponse.json({ error: "Apenas o WEB Master pode excluir usuários." }, { status: 403 })
    }

    if (targetId === authData.user.id) {
      return NextResponse.json({ error: "Você não pode excluir a própria conta por aqui." }, { status: 400 })
    }

    // Ação irreversível: limita tentativas por WEB Master e por IP, além da
    // autorização em si — um token comprometido não deve conseguir varrer a
    // base de usuários.
    const rateLimit = await checkRateLimit({
      action: "admin_user_delete",
      identifier: `${authData.user.id}:${getClientIdentifier(request)}`,
      maxAttempts: 15,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas exclusões em pouco tempo. Aguarde antes de tentar novamente." },
        { status: 429 }
      )
    }

    const admin = createSupabaseAdminClient()

    const { data: targetAuthUser } = await admin.auth.admin.getUserById(targetId)
    if (!targetAuthUser?.user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
    }

    const { data: targetProfile } = await admin
      .from("admin_profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle()

    if ((targetProfile as { role?: string } | null)?.role === "webmaster") {
      return NextResponse.json({ error: "Uma conta WEB Master não pode ser excluída por este painel." }, { status: 403 })
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null

    await deleteUserAsAdmin(targetId, {
      actorId: authData.user.id,
      targetEmail: targetAuthUser.user.email ?? null,
      ipAddress,
    })

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetId)
    if (deleteAuthError) {
      return NextResponse.json(
        { error: "O perfil foi removido, mas a conta de autenticação falhou ao ser excluída. Contate o suporte técnico." },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao excluir usuário." }, { status: 500 })
  }
}
