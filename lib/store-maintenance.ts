// Fonte única da flag de manutenção da Loja e do horário-alvo de lançamento.
// A checagem de segurança (bloquear pedidos) sempre depende só de
// isStoreMaintenanceEnabled() — o countdown em getStoreLaunchAt() é
// puramente informativo para a UI, nunca decide sozinho se a loja abre.
//
// IMPORTANTE: há consumidores client-side (`components/auth/auth-user.tsx` e
// `components/account/AccountSection.tsx`, que escondem o item "Programa de
// Afiliados"). No browser a variante sem NEXT_PUBLIC_ não existe, então
// STORE_MAINTENANCE_MODE sozinha faz esta função retornar false no client e a
// UI vaza. Sempre defina NEXT_PUBLIC_STORE_MAINTENANCE_MODE com o mesmo valor,
// em TODOS os ambientes (local e Vercel). Ver .env.example.

export function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

// ISO string do horário-alvo de lançamento da Loja, ou null quando não há
// data definida. Configurável via STORE_LAUNCH_AT (ex.:
// "2026-08-22T23:00:00.000Z" — já em UTC) para permitir adiar o lançamento só
// trocando a env, sem novo deploy.
//
// Sem a env (ou com valor inválido) o retorno é null e o countdown some da
// tela de "Coming soon": um contador só faz sentido apontando para uma data
// que alguém realmente escolheu. Havia aqui um fallback de "próximo sábado às
// 20h de Brasília" que anunciava uma data de lançamento que ninguém tinha
// marcado — e, por ser relativa a agora, se empurrava sozinha para a frente
// toda semana.
export function getStoreLaunchAt(): string | null {
  const configured = process.env.STORE_LAUNCH_AT ?? process.env.NEXT_PUBLIC_STORE_LAUNCH_AT
  if (!configured) return null

  const parsed = new Date(configured)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString()
}
