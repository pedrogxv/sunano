import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

/**
 * "Pacote Loja" — Loja + Programa de Afiliados liberados individualmente.
 *
 * Dois jeitos de atravessar a manutenção (env ou `STORE_FORCED_CLOSED`):
 *   • `user_profiles.store_access = true` (liberação por usuário, concedida
 *     só por WEB MASTER em /admin/users);
 *   • ser WEB MASTER (13/10/2026: Loja aberta só para a equipe enquanto o
 *     Stripe entra em produção). A tela mostra o aviso "Web Master special"
 *     (`StoreBypassNotice`) para ninguém confundir com a Loja aberta ao público.
 *     Para voltar a ver o que o público vê, remova `isWebMasterUser` abaixo e
 *     a condição `isWebMaster(profile)` do gate de Loja no proxy.ts.
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

async function isWebMasterUser(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("admin_profiles").select("role").eq("id", userId).maybeSingle()
  // Mesmo corte de `isWebMaster` (lib/admin-permissions.ts).
  return (data as { role?: string | null } | null)?.role === "webmaster"
}

/**
 * O usuário atual pode usar a Loja/Afiliados AGORA?
 *
 * `true` quando a loja está aberta para ele: porque não há manutenção, ou
 * porque ele tem `store_access`, ou porque é WEB MASTER.
 */
export async function canUseStoreNow(): Promise<boolean> {
  // Sem manutenção a loja está aberta para todo mundo — nem toca no banco.
  if (!isStoreMaintenanceEnabled()) return true

  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  // Visitante anônimo nunca fura a manutenção: o bypass depende de saber
  // QUEM é a pessoa.
  if (!authData.user) return false

  const [storeAccess, webMaster] = await Promise.all([
    hasStoreAccessFlag(authData.user.id),
    isWebMasterUser(authData.user.id),
  ])
  return storeAccess || webMaster
}

/**
 * Inverso de `canUseStoreNow`, para os guards que leem melhor como recusa.
 * Retorna `true` quando a requisição deve ser RECUSADA.
 */
export async function isStoreBlockedByMaintenance(): Promise<boolean> {
  return !(await canUseStoreNow())
}
