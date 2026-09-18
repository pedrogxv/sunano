import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

/**
 * "Pacote Loja" — Loja + Programa de Afiliados liberados individualmente.
 *
 * Existe UM jeito de atravessar `STORE_MAINTENANCE_MODE=true`: ter
 * `user_profiles.store_access = true` (liberação por usuário, concedida só
 * por WEB MASTER em /admin/users, inclusive para a própria conta).
 *
 * Ser WEB MASTER NÃO fura mais a manutenção sozinho (18/09/2026). Com o
 * bypass automático, o dono do site via a loja aberta o tempo todo e não
 * tinha como conferir o que o público vê. Quem precisa testar a loja durante
 * a manutenção liga o próprio `store_access` e desliga depois.
 *
 * O acesso liberado é o de um usuário NORMAL com a loja aberta, sem nenhum
 * privilégio extra de preço, estoque, comissão ou pagamento. O flag só
 * responde "a loja está aberta para esta pessoa?".
 *
 * Fonte única: qualquer lugar que decide manutenção da Loja/Afiliados deve
 * usar isto (ou `hasStoreAccess` no proxy, que lê a mesma coluna), senão o
 * bypass fica valendo em metade do fluxo (usuário entra em /loja mas toma 503
 * no checkout).
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
 * `true` quando a loja está aberta para ele: porque não há manutenção, ou
 * porque ele tem `store_access`.
 */
export async function canUseStoreNow(): Promise<boolean> {
  // Sem manutenção a loja está aberta para todo mundo — nem toca no banco.
  if (!isStoreMaintenanceEnabled()) return true

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  // Visitante anônimo nunca fura a manutenção: o bypass depende de saber
  // QUEM é a pessoa.
  if (!authData.user) return false

  return hasStoreAccessFlag(authData.user.id)
}

/**
 * Inverso de `canUseStoreNow`, para os guards que leem melhor como recusa.
 * Retorna `true` quando a requisição deve ser RECUSADA.
 */
export async function isStoreBlockedByMaintenance(): Promise<boolean> {
  return !(await canUseStoreNow())
}
