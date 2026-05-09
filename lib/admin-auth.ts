import type { AdminProfile } from "@/lib/admin-permissions"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export type AuthorizedProfileResult = {
  error: string | null
  status: 200 | 401 | 403
  profile: AdminProfile | null
}

export async function getAuthorizedProfile(): Promise<AuthorizedProfileResult> {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return { error: "Sessão expirada. Entre novamente no admin.", status: 401 as const, profile: null }
  }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, role, permissions")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (!profile) {
    return { error: "Perfil administrativo não encontrado.", status: 403 as const, profile: null }
  }

  return { error: null, status: 200 as const, profile: profile as AdminProfile }
}
