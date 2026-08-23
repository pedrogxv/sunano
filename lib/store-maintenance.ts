// Fonte única da flag de manutenção da Loja e do horário-alvo de lançamento.
// A checagem de segurança (bloquear pedidos) sempre depende só de
// isStoreMaintenanceEnabled() — o countdown em getStoreLaunchAt() é
// puramente informativo para a UI, nunca decide sozinho se a loja abre.

export function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

// Próximo sábado às 20h no horário de Brasília (America/Sao_Paulo, UTC-3
// fixo — o Brasil não usa mais horário de verão), usado quando
// STORE_LAUNCH_AT não está configurada.
function nextSaturdayAt20BRT(): Date {
  const BRT_OFFSET_HOURS = 3
  const now = new Date()
  const nowBrt = new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000)

  const daysUntilSaturday = (6 - nowBrt.getUTCDay() + 7) % 7
  const target = new Date(
    Date.UTC(nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate() + daysUntilSaturday, 20 + BRT_OFFSET_HOURS, 0, 0, 0)
  )

  // Se hoje já é sábado e já passou das 20h BRT, pula para o próximo sábado.
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 7)
  }

  return target
}

// ISO string do horário-alvo de lançamento da Loja. Configurável via
// STORE_LAUNCH_AT (ex.: "2026-08-22T23:00:00.000Z" — já em UTC) para permitir
// adiar o lançamento só trocando a env, sem novo deploy. Sem a env, cai no
// fallback de "próximo sábado 20h de Brasília".
export function getStoreLaunchAt(): string {
  const configured = process.env.STORE_LAUNCH_AT ?? process.env.NEXT_PUBLIC_STORE_LAUNCH_AT
  if (configured) {
    const parsed = new Date(configured)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  return nextSaturdayAt20BRT().toISOString()
}
