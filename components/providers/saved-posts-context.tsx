"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"

import { useAuthUser } from "@/components/providers/auth-context"

type SavedPostsContextValue = {
  /** `true` enquanto a lista de salvos ainda não voltou do servidor — o botão de salvar deve ficar desabilitado até isso resolver, nunca mostrar um estado que pode estar errado. */
  loading: boolean
  isSaved: (postId: string) => boolean
  /** Atualiza o cache local otimisticamente após um toggle bem-sucedido — evita nova requisição de lista inteira a cada clique. */
  setSaved: (postId: string, saved: boolean) => void
}

const SavedPostsContext = createContext<SavedPostsContextValue>({
  loading: true,
  isSaved: () => false,
  setSaved: () => {},
})

/**
 * Ids dos posts salvos pelo usuário atual, carregados UMA vez por sessão
 * (não por card) assim que a autenticação resolve — monta no layout raiz
 * igual `AuthProvider`.
 *
 * Antes disso, cada `PostSaveButton` perguntava individualmente ao montar,
 * então toda a listagem do fórum abria com N requisições e cada ícone
 * "salvo" nascia mostrando o estado errado (não-salvo) por 2-3s até a
 * resposta dele voltar — 1 request por post visível. Aqui é 1 request pra
 * página inteira, e enquanto ela não volta o botão fica em `loading`
 * (desabilitado), nunca mostrando um estado que pode estar errado.
 */
export function SavedPostsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthUser()
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)

  useEffect(() => {
    // Espera a auth resolver antes de decidir: sem isso, um visitante
    // deslogado veria `loading: false` prematuro (nenhum post é "salvo"
    // mesmo) mas quem está logado herdaria esse mesmo `false` por um
    // instante antes do fetch real disparar.
    if (authLoading) return

    if (!user) {
      requestId.current++
      setIds(new Set())
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    fetch("/api/forum/posts/salvos/ids", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (id !== requestId.current) return
        setIds(new Set(Array.isArray(data?.ids) ? data.ids : []))
      })
      .catch(() => {})
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [user, authLoading])

  const value = useMemo<SavedPostsContextValue>(
    () => ({
      loading,
      isSaved: (postId: string) => ids.has(postId),
      setSaved: (postId: string, saved: boolean) => {
        setIds((prev) => {
          const next = new Set(prev)
          if (saved) next.add(postId)
          else next.delete(postId)
          return next
        })
      },
    }),
    [ids, loading]
  )

  return <SavedPostsContext.Provider value={value}>{children}</SavedPostsContext.Provider>
}

export function useSavedPosts() {
  return useContext(SavedPostsContext)
}
