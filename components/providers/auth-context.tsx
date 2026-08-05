"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import { supabaseAuth } from "@/lib/client/supabase-auth"

export type AuthContextUser = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  isAdmin: boolean
}

type AuthContextValue = {
  user: AuthContextUser | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

/** Teto para `/api/auth/me`. Um fetch pendurado sem limite deixaria o avatar da
 *  topbar em skeleton e o sino invisível para sempre. */
const ME_TIMEOUT_MS = 8000

/** Espera antes da única retentativa. Cobre a queda momentânea de rede que,
 *  sem ela, mostraria "Login" a quem está logado até a próxima navegação. */
const RETRY_DELAY_MS = 1200

/**
 * Assinatura dos cookies de sessão do Supabase, para detectar que a sessão
 * MUDOU sem perguntar nada ao servidor.
 *
 * Compara o valor, e não a mera presença: concluir o 2FA troca uma sessão aal1
 * por uma aal2 mantendo o cookie existindo o tempo todo — um booleano de
 * "existe/não existe" não veria diferença nenhuma e deixaria a topbar
 * desatualizada justamente para quem usa segundo fator.
 *
 * É um sinal BARATO e síncrono para decidir se vale reperguntar ao servidor —
 * nunca a fonte de verdade sobre quem está logado. Hoje esses cookies não são
 * `httpOnly` (o client do navegador precisa lê-los); se um dia forem, esta
 * função passa a devolver "" sempre e o efeito que a consome simplesmente para
 * de disparar reconsultas extras — nunca produz estado errado.
 */
function sessionCookieSignature(): string {
  if (typeof document === "undefined") return ""
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => {
      const name = entry.split("=")[0] ?? ""
      // O `-code-verifier` existe DURANTE o fluxo OAuth, quando ainda não há
      // sessão: incluí-lo provocaria uma consulta inútil.
      return name.startsWith("sb-") && name.includes("-auth-token") && !name.includes("code-verifier")
    })
    // O cookie é fatiado em `.0`, `.1`… quando o JWT é grande; a ordem em
    // `document.cookie` não é garantida, então ordena antes de comparar.
    .sort()
    .join("|")
}

type MeResponse = {
  user?: { id: string; email: string | null } | null
  userProfile?: { display_name?: string | null; avatar_url?: string | null } | null
  adminProfile?: { email?: string | null; display_name?: string | null; avatar_url?: string | null } | null
}

/**
 * Quem está logado, segundo o SERVIDOR — que lê o cookie de sessão e já aplica
 * a regra de 2FA (devolve `user: null` enquanto a sessão está em aal1 com fator
 * pendente, ver app/api/auth/me/route.ts). Por isso o cliente não precisa — e
 * não deve — repetir a checagem de MFA por conta própria.
 */
async function fetchMe(signal: AbortSignal): Promise<AuthContextUser | null> {
  const res = await fetch("/api/auth/me", { signal, cache: "no-store" })
  if (!res.ok) throw new Error(`auth/me respondeu ${res.status}`)

  const data = (await res.json()) as MeResponse
  const { user, userProfile, adminProfile } = data
  if (!user) return null

  return {
    id: user.id,
    email: adminProfile?.email || user.email || "",
    displayName:
      adminProfile?.display_name ||
      userProfile?.display_name ||
      user.email?.split("@")[0] ||
      "Usuário",
    avatarUrl: adminProfile?.avatar_url || userProfile?.avatar_url || null,
    isAdmin: Boolean(adminProfile),
  }
}

/**
 * Única fonte de verdade sobre a sessão no cliente, montada uma vez na raiz
 * (app/layout.tsx).
 *
 * São três gatilhos, e nenhum depende dos outros:
 *
 *  1. MOUNT — `/api/auth/me`, uma chamada HTTP comum que só depende do cookie e
 *     não encosta no lock de auth do gotrue-js. É sempre esta que produz a
 *     primeira resposta. Quando o `onAuthStateChange` era a única fonte,
 *     qualquer falha em entregar o evento inicial (webview, aba restaurada,
 *     lock órfão) travava a topbar no esqueleto para sempre.
 *  2. NAVEGAÇÃO — cobre login/2FA/logout, que são server actions: o cookie
 *     muda no servidor sem que o client do navegador fique sabendo.
 *  3. `onAuthStateChange` — cobre o que acontece pelo próprio navegador
 *     (`signOut()` client-side, OAuth, refresh de token).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextUser | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  // Descarta respostas fora de ordem — sem isso um `me` lento disparado antes
  // de um logout poderia ressuscitar o usuário depois de ele sair.
  const requestId = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Assinatura do cookie na última vez que consultamos o servidor. Guardar
  // isso é o que impede o efeito de navegação de virar um laço infinito quando
  // o cookie existe mas `/api/auth/me` responde `null` — o caso real de uma
  // sessão aal1 com 2FA pendente.
  const cookieAtLastCheck = useRef<string | null>(null)

  const resolve = useCallback(() => {
    const run = (attempt: number) => {
      const id = ++requestId.current
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), ME_TIMEOUT_MS)
      cookieAtLastCheck.current = sessionCookieSignature()

      fetchMe(controller.signal)
        .then((next) => {
          if (id !== requestId.current) return
          setUser(next)
        })
        .catch(() => {
          // Rede fora ou estouro do teto: não dá para afirmar nada sobre a
          // sessão, então preserva o que já havia e tenta de novo UMA vez, em
          // segundo plano. A UI é destravada no `finally` de qualquer jeito:
          // ficar em `loading` é o pior dos mundos, porque esconde o sino e o
          // menu da conta sem nem oferecer o botão de login.
          if (attempt === 0 && id === requestId.current) {
            retryTimer.current = setTimeout(() => run(attempt + 1), RETRY_DELAY_MS)
          }
        })
        .finally(() => {
          clearTimeout(timeout)
          if (id === requestId.current) setLoading(false)
        })
    }

    run(0)
  }, [])

  useEffect(() => {
    resolve()

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((event) => {
      // Este callback roda COM o lock de auth do gotrue-js segurado. Nada de
      // `await` aqui dentro, e muito menos outra chamada de `supabaseAuth.auth`
      // (era `mfa.getAuthenticatorAssuranceLevel()`): ela fica esperando o
      // mesmo lock que este callback segura, o callback nunca termina e o
      // estado nunca sai de `loading`. Todo trabalho assíncrono sai por
      // `setTimeout`, já fora do lock — recomendação da própria Supabase.
      if (event === "SIGNED_OUT") {
        requestId.current++ // invalida qualquer `me` em voo
        if (retryTimer.current) clearTimeout(retryTimer.current)
        cookieAtLastCheck.current = sessionCookieSignature()
        setUser(null)
        setLoading(false)
        return
      }

      // INITIAL_SESSION já está coberto pelo `resolve()` do mount e
      // TOKEN_REFRESHED não muda quem é o usuário — refazer o fetch neles só
      // gera tráfego à toa.
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") {
        setTimeout(() => resolve(), 0)
      }
    })

    return () => {
      subscription.unsubscribe()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [resolve])

  useEffect(() => {
    // Login, 2FA e logout são SERVER ACTIONS que terminam em `redirect()`: o
    // cookie muda no servidor e a navegação é client-side, então o layout raiz
    // não remonta (este provider continua com o estado antigo) e o
    // `onAuthStateChange` do navegador não tem como saber de nada — ele só
    // emite eventos de operações feitas pelo próprio client do browser. Sem
    // este efeito, quem acabou de entrar continuaria vendo "Login" e sem sino
    // até apertar F5.
    //
    // Só reconsulta quando o cookie MUDOU desde a última consulta, para não
    // gastar um request a cada navegação de quem está apenas navegando.
    if (cookieAtLastCheck.current === sessionCookieSignature()) return
    resolve()
  }, [pathname, resolve])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Estado de autenticação resolvido uma única vez na raiz do app. */
export function useAuthUser() {
  return useContext(AuthContext)
}
