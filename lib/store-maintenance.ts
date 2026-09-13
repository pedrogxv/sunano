// Fonte única da flag de manutenção da Loja e do horário-alvo de lançamento.
// A checagem de segurança (bloquear pedidos) sempre depende só de
// isStoreMaintenanceEnabled() — o countdown em getStoreLaunchAt() é
// puramente informativo para a UI, nunca decide sozinho se a loja abre.
//
// ESTA FUNÇÃO É SERVER-SIDE. Não a chame de um Client Component: no browser a
// variante sem NEXT_PUBLIC_ não existe e ela responderia `false`, vazando a UI
// que deveria estar escondida.
//
// Quem precisa do estado no cliente recebe por PROP, resolvido no servidor —
// `authUser.canUseStore`, de /api/auth/me (ver `components/auth/auth-user.tsx`
// e `components/account/AccountSection.tsx`, que escondem "Programa de
// Afiliados"). Isso é melhor que uma env `NEXT_PUBLIC_`: a resposta já embute
// os bypasses por usuário (WEB MASTER e `store_access`), que uma env não tem
// como expressar.
//
// O fallback para NEXT_PUBLIC_STORE_MAINTENANCE_MODE abaixo é só rede de
// segurança para leitura em client legado; não dependa dele em código novo.

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
