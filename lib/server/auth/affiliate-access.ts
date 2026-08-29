import "server-only"

import { isWebMaster } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"

// Mensagem única para todas as recusas do Programa de Afiliados em manutenção,
// para que proxy, rotas de API e páginas digam exatamente a mesma coisa.
export const AFFILIATES_MAINTENANCE_MESSAGE =
  "O Programa de Afiliados está temporariamente indisponível."

/**
 * O Programa de Afiliados acompanha a manutenção da Loja: sem loja aberta não
 * há venda para comissionar, então em `STORE_MAINTENANCE_MODE=true` a área
 * inteira fecha. Igual à Loja (ver app/loja/page.tsx e api/store/checkout),
 * o WEB MASTER ignora a manutenção e continua com acesso normal.
 *
 * Retorna `true` quando a requisição deve ser RECUSADA.
 */
export async function isAffiliatesBlockedByMaintenance(): Promise<boolean> {
  if (!isStoreMaintenanceEnabled()) return false

  const { profile } = await getAuthorizedProfile()
  return !isWebMaster(profile)
}
