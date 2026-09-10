import "server-only"

import { isWebMaster, type AdminProfile } from "@/lib/admin-permissions"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

/**
 * "Pacote Loja" — Loja + Programa de Afiliados liberados individualmente.
 *
 * Existem DOIS jeitos de atravessar `STORE_MAINTENANCE_MODE=true`:
 *
 *   1. ser WEB MASTER (regra antiga, mantida);
 *   2. ter `user_profiles.store_access = true` (liberação por usuário,
 *      concedida só por WEB MASTER em /admin/users).
 *
 * Em ambos os casos o acesso é o de um usuário NORMAL com a loja aberta —
 * nenhum privilégio extra de preço, estoque, comissão ou pagamento. O flag só
 * responde "a loja está aberta para esta pessoa?".
 *
 * Fonte única: qualquer lugar que antes perguntava `isWebMaster(profile)` para
 * decidir manutenção da Loja/Afiliados deve passar a usar isto, senão o bypass
 * fica valendo em metade do fluxo (usuário entra em /loja mas toma 503 no
 * checkout).
 */
export async function hasStoreAccessFlag(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("store_access")
    .eq("id", userId)
    .maybeSingle()
  return Boolean((data as { store_access?: boolean } | null)?.store_access)
}

/**
 * O usuário atual pode usar a Loja/Afiliados AGORA?
 *
 * `true` quando a loja está aberta para ele — porque não há manutenção, ou
 * porque ele fura a manutenção (WEB MASTER ou `store_access`).
 */
export async function canUseStoreNow(): Promise<boolean> {
  // Sem manutenção a loja está aberta para todo mundo — nem toca no banco.
  if (!isStoreMaintenanceEnabled()) return true

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  // Visitante anônimo nunca fura a manutenção: os dois bypasses dependem de
  // saber QUEM é a pessoa.
  if (!authData.user) return false

  const userId = authData.user.id
  const db = createSupabaseAdminClient()

  // As duas checagens em paralelo: são tabelas diferentes e independentes, e
  // este helper roda no caminho de renderização de /loja e do checkout.
  const [{ data: adminRow }, storeAccess] = await Promise.all([
    db.from("admin_profiles").select("id, role, permissions").eq("id", userId).maybeSingle(),
    hasStoreAccessFlag(userId),
  ])

  return isWebMaster(adminRow as AdminProfile | null) || storeAccess
}

/**
 * Inverso de `canUseStoreNow`, para os guards que leem melhor como recusa.
 * Retorna `true` quando a requisição deve ser RECUSADA.
 */
export async function isStoreBlockedByMaintenance(): Promise<boolean> {
  return !(await canUseStoreNow())
}
