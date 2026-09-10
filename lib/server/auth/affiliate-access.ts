import "server-only"

import { isStoreBlockedByMaintenance } from "@/lib/server/auth/store-access"

// Mensagem única para todas as recusas do Programa de Afiliados em manutenção,
// para que proxy, rotas de API e páginas digam exatamente a mesma coisa.
export const AFFILIATES_MAINTENANCE_MESSAGE =
  "O Programa de Afiliados está temporariamente indisponível."

/**
 * O Programa de Afiliados acompanha a manutenção da Loja: sem loja aberta não
 * há venda para comissionar, então em `STORE_MAINTENANCE_MODE=true` a área
 * inteira fecha. Furam a manutenção, igual à Loja, o WEB MASTER e quem tem a
 * liberação individual (`user_profiles.store_access`) — a regra completa vive
 * em lib/server/auth/store-access.ts, que é a fonte única dos dois.
 *
 * Retorna `true` quando a requisição deve ser RECUSADA.
 */
export async function isAffiliatesBlockedByMaintenance(): Promise<boolean> {
  return isStoreBlockedByMaintenance()
}
