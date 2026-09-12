/**
 * Fonte única da flag de manutenção GERAL do site (não confundir com
 * `lib/store-maintenance.ts`, que fecha só a Loja e os Afiliados).
 *
 * Lê SOMENTE a env server-side. Existia um fallback para
 * `NEXT_PUBLIC_MAINTENANCE_MODE` e ele foi removido de propósito:
 *
 *  - `NEXT_PUBLIC_*` é inlinada no bundle no momento do build, então o valor
 *    ficaria congelado no último deploy — ligar a manutenção pela env do
 *    runtime não teria efeito nos consumidores que lessem a variante pública.
 *  - E ela vazaria o estado operacional do site para qualquer visitante.
 *
 * Todos os consumidores desta flag são server-side (proxy, sitemap, robots,
 * a sonda de status), então a variante pública nunca foi necessária. Se algum
 * dia um componente client precisar saber, ele deve perguntar para a sonda
 * `/api/maintenance-status`, nunca ler env.
 */
export function isMaintenanceEnabled() {
  return process.env.MAINTENANCE_MODE === "true"
}
