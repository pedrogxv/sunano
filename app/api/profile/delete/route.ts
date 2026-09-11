import { NextRequest, NextResponse } from "next/server"

import { deleteUserAccountData } from "@/lib/server/repositories/users-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const userId = authData.user.id
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null

    // Anonimiza dados do fórum/loja e remove o perfil, registrando no audit_log
    await deleteUserAccountData(userId, { ipAddress, actorId: userId })

    const admin = createSupabaseAdminClient()
    const { error } = await admin.auth.admin.deleteUser(userId)

    if (error) {
      // Mensagem genérica de propósito: `error.message` vem da API admin do
      // Supabase Auth (server-side, não pensada para usuário final) e pode
      // descrever detalhe interno. O log guarda o motivo real para suporte.
      console.error("[profile/delete] admin.deleteUser:", error.message)
      return NextResponse.json({ error: "Não foi possível excluir a conta. Tente novamente." }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao excluir a conta." }, { status: 500 })
  }
}
