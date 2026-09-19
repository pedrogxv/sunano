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
// o bypass por usuário (`store_access`), que uma env não tem
// como expressar.
//
// O fallback para NEXT_PUBLIC_STORE_MAINTENANCE_MODE abaixo é só rede de
// segurança para leitura em client legado; não dependa dele em código novo.

export function isStoreMaintenanceEnabled() {
  const value = process.env.STORE_MAINTENANCE_MODE ?? process.env.NEXT_PUBLIC_STORE_MAINTENANCE_MODE
  return value === "true"
}

// Lançamento marcado: sábado, 19/09/2026, 9h de Brasília (12h UTC). Fica
// no código para o contador entrar no ar junto com o deploy, sem depender de
// configurar env na Vercel.
const STORE_LAUNCH_AT_DEFAULT = "2026-09-19T09:00:00-03:00"

// ISO string do horário-alvo de lançamento da Loja, ou null quando não há
// contador para mostrar. STORE_LAUNCH_AT (ex.: "2026-09-21T13:00:00.000Z")
// sobrescreve a data acima: para adiar, troque a env e faça redeploy.
//
// O padrão é uma data FIXA que alguém escolheu. Havia aqui um fallback de
// "próximo sábado às 20h de Brasília" que anunciava um lançamento que ninguém
// tinha marcado e, por ser relativo a agora, se empurrava sozinho para a
// frente toda semana.
//
// Data que já passou devolve null: se a loja ainda estiver em manutenção
// depois do horário, a tela "Coming soon" fica sem contador em vez de
// mostrar 00:00:00:00 para sempre.
export function getStoreLaunchAt(): string | null {
  // `||` e não `??`: o .env.example traz `STORE_LAUNCH_AT=` vazio, e string
  // vazia tem de cair na data padrão.
  const configured =
    process.env.STORE_LAUNCH_AT || process.env.NEXT_PUBLIC_STORE_LAUNCH_AT || STORE_LAUNCH_AT_DEFAULT

  const parsed = new Date(configured)
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.getTime() <= Date.now()) return null

  return parsed.toISOString()
}
