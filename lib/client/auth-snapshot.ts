"use client"

import type { AuthContextUser } from "@/components/providers/auth-context"

/**
 * Último estado de sessão conhecido, guardado no `localStorage` do próprio
 * visitante.
 *
 * POR QUE EXISTE
 * --------------
 * As páginas indexáveis do site (fórum, blog, notícias, periféricos, loja)
 * são servidas do cache ISR: o HTML é o MESMO para todo mundo e portanto não
 * pode conter a sessão de ninguém. Resolver a sessão no servidor dentro do
 * layout raiz resolveria o salto visual, mas tornaria toda rota dinâmica e
 * mataria esse cache junto — custo de SEO e uma ida ao banco por visita.
 * Envolver em `<Suspense>` não salva: sem Cache Components (que exigiria
 * migrar as ~40 rotas que hoje usam `dynamic`/`revalidate`) um Suspense não é
 * fronteira de prerendering, e as rotas viram dinâmicas do mesmo jeito — foi
 * medido com `next build` antes e depois.
 *
 * Então a sessão continua sendo resolvida no cliente, e o que remove o salto
 * é PARTIR do último estado conhecido em vez de partir do zero. Quem já
 * visitou logado vê a interface certa imediatamente (selo VIP, avatar, sino),
 * e o `/api/auth/me` que roda em seguida apenas confirma — sem troca visível,
 * porque o valor confirmado é igual ao exibido.
 *
 * LIMITES, E POR QUE SÃO ACEITÁVEIS
 * ---------------------------------
 * Isto é uma DICA DE RENDERIZAÇÃO, nunca uma fonte de autoridade. Não
 * concede acesso a nada: toda decisão real continua no servidor, que lê o
 * cookie e aplica RLS. Adulterar este valor no `localStorage` muda só o que o
 * próprio visitante vê na própria tela por alguns milissegundos, até a
 * resposta real chegar — o mesmo que ele já consegue fazer com o devtools
 * aberto.
 *
 * Por isso também nunca guarda token, e-mail nem nada que já não estivesse
 * visível na interface para aquele usuário.
 */

const KEY = "sunano:auth-snapshot:v1"

/**
 * Validade do palpite. Passado esse prazo, é melhor mostrar o esqueleto por um
 * instante do que afirmar com confiança um estado de VIP que pode ter vencido
 * (`vip_expires_at`, cancelamento, compra com Aura — nada disso troca o cookie
 * de sessão, então o snapshot não fica sabendo).
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

type Stored = { at: number; user: AuthContextUser }

/**
 * Lê o último estado conhecido, ou `null` se não houver, estiver velho ou
 * ilegível.
 *
 * Todo acesso é embrulhado em try/catch: `localStorage` LANÇA em aba anônima
 * com cookies bloqueados e em webview com storage desabilitado, e um throw
 * aqui derrubaria a árvore inteira na primeira renderização.
 */
export function readAuthSnapshot(): AuthContextUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Stored
    if (!parsed?.user || typeof parsed.at !== "number") return null
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return parsed.user
  } catch {
    return null
  }
}

/** Grava o estado confirmado pelo servidor, ou limpa tudo no logout. */
export function writeAuthSnapshot(user: AuthContextUser | null): void {
  if (typeof window === "undefined") return
  try {
    if (!user) {
      window.localStorage.removeItem(KEY)
      return
    }
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), user } satisfies Stored))
  } catch {
    // Storage cheio ou bloqueado: seguir sem cache é degradação aceitável —
    // volta a ser exatamente o comportamento anterior a esta otimização.
  }
}
