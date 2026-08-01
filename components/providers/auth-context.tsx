"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { isMfaStepUpRequired } from "@/lib/auth-mfa"
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

/**
 * Única assinatura de `onAuthStateChange` do app inteiro, montada uma vez na
 * raiz (app/layout.tsx). Antes, TopBar, fórum (lista) e fórum (tópico) cada
 * um assinava o próprio `onAuthStateChange` — a TopBar "funcionava" porque só
 * monta uma vez, mas as páginas de fórum remontam a cada navegação e
 * reiniciavam a corrida contra o lock (ver comentário em
 * lib/client/supabase-auth.ts) toda vez, aumentando a chance de mostrar
 * "entrar" pra quem já está logado. Com o provider montado uma vez só, a
 * sessão resolvida persiste entre navegações client-side.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Em alguns navegadores mobile (webviews como o do Telegram) o evento
    // inicial do onAuthStateChange pode nunca disparar. Depois de alguns
    // segundos, assume-se deslogado — se o evento chegar depois, o estado é
    // corrigido.
    const timeout = setTimeout(() => setLoading(false), 6000)

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(timeout)
      if (session?.user) {
        // Sessão aal1 com 2FA pendente: tratar como anônimo até concluir o
        // segundo fator.
        const { data: aal } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel()
        if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
          setUser(null)
          setLoading(false)
          return
        }

        const fallbackName = session.user.email?.split("@")[0] || "Usuário"
        try {
          const res = await fetch("/api/auth/me")
          const data = await res.json()
          const adminProfile = data?.adminProfile
          const userProfile = data?.userProfile
          setUser({
            id: session.user.id,
            email: adminProfile?.email || session.user.email || "",
            displayName: adminProfile?.display_name || userProfile?.display_name || fallbackName,
            avatarUrl: adminProfile?.avatar_url || userProfile?.avatar_url || null,
            isAdmin: Boolean(adminProfile),
          })
        } catch {
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            displayName: fallbackName,
            avatarUrl: null,
            isAdmin: false,
          })
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Estado de autenticação resolvido uma única vez na raiz do app. */
export function useAuthUser() {
  return useContext(AuthContext)
}
