import "server-only"

import type { AdminProfile } from "@/lib/admin-permissions"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

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

export type WebMasterResult =
  | { ok: true; profile: AdminProfile }
  | { ok: false; error: string; status: 401 | 403 }

/**
 * Rotas que só o WEB MASTER usa (feature flags, sorteios em lançamento).
 * Cargo, não permissão da matriz: o mesmo corte de `/admin/users` e dos
 * avisos do sistema, para o que muda o site inteiro de uma vez.
 */
export async function requireWebMaster(): Promise<WebMasterResult> {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return { ok: false, error: auth.error ?? "Não autorizado.", status: auth.status === 401 ? 401 : 403 }
  }
  if (auth.profile.role !== "webmaster") {
    return { ok: false, error: "Apenas o WEB Master tem acesso.", status: 403 }
  }
  return { ok: true, profile: auth.profile }
}
