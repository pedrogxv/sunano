"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"

import { useAuthUser } from "@/components/providers/auth-context"

type AuraReactionsContextValue = {
  /** `true` enquanto ainda não sabemos se ESTE post foi reagido — o botão deve ficar neutro até resolver, nunca fingir "não reagido". */
  isPending: (postId: string) => boolean
  hasReacted: (postId: string) => boolean
  /** Atualiza o cache local após um toggle bem-sucedido, sem refazer a consulta. */
  setReacted: (postId: string, reacted: boolean) => void
  /** Chamado por cada card ao montar; os ids são acumulados e consultados em lote. */
  registerPost: (postId: string) => void
}

const AuraReactionsContext = createContext<AuraReactionsContextValue>({
  isPending: () => false,
  hasReacted: () => false,
  setReacted: () => {},
  registerPost: () => {},
})

/** Resultado de um lote: quais ids foram perguntados e quais voltaram reagidos. */
type ReactionState = {
  /** Dono destes dados. Usado pra descartar tudo quando a sessão troca. */
  ownerId: string | null
  /** Ids já resolvidos (reagidos ou não) — diferencia "não reagiu" de "ainda não sei". */
  resolved: Set<string>
  reacted: Set<string>
}

const EMPTY_STATE: ReactionState = { ownerId: null, resolved: new Set(), reacted: new Set() }

/**
 * Em quais posts o usuário atual já deu aura, resolvido em LOTE.
 *
 * Antes, cada `PostAuraButton` perguntava por conta própria
 * (`GET /api/forum/posts/[slug]/aura`) ao montar: abrir o fórum logado
 * disparava 20 requisições paralelas, e cada uma pagava um
 * `supabase.auth.getUser()` (ida à rede até o servidor de Auth do Supabase)
 * mais dois lookups no banco. Aqui os ids que os cards registram ao montar
 * são acumulados e consultados de uma vez só — mesmo desenho do
 * `SavedPostsProvider`, que já resolvia isso para o botão de salvar.
 *
 * O acúmulo acontece num microtask: os 20 cards da primeira página montam no
 * mesmo commit do React, então todos entram no mesmo lote. O scroll infinito
 * acrescenta páginas depois, e cada página vira UM lote novo com apenas os
 * ids ainda desconhecidos.
 */
export function AuraReactionsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthUser()
  const userId = user?.id ?? null

  const [state, setState] = useState<ReactionState>(EMPTY_STATE)

  /** Bookkeeping do lote em voo — nada aqui influencia a render, por isso vive em ref. */
  const batch = useRef<{ owner: string | null; known: Set<string>; pending: Set<string>; scheduled: boolean }>({
    owner: null,
    known: new Set(),
    pending: new Set(),
    scheduled: false,
  })

  // Sessão trocou: o que já sabíamos era do dono anterior. Derivado durante a
  // render (sem efeito e sem mexer em ref), então ninguém chega a ver os dados
  // do usuário antigo — se o `ownerId` não bate, este render já trata tudo
  // como desconhecido.
  const current = state.ownerId === userId ? state : EMPTY_STATE

  const flush = useCallback(async (owner: string | null) => {
    const b = batch.current
    b.scheduled = false
    const ids = Array.from(b.pending)
    b.pending = new Set()
    if (ids.length === 0 || !owner) return

    try {
      const res = await fetch("/api/forum/posts/aura/reacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: ids }),
        cache: "no-store",
      })
      const data = res.ok ? await res.json() : null
      // A sessão pode ter mudado enquanto o lote estava em voo.
      if (batch.current.owner !== owner) return

      const reactedIds: string[] = Array.isArray(data?.postIds) ? data.postIds : []
      setState((prev) => {
        const base: ReactionState =
          prev.ownerId === owner ? prev : { ownerId: owner, resolved: new Set<string>(), reacted: new Set<string>() }
        const resolved = new Set(base.resolved)
        const reacted = new Set(base.reacted)
        for (const id of ids) resolved.add(id)
        for (const id of reactedIds) reacted.add(id)
        return { ownerId: owner, resolved, reacted }
      })
    } catch {
      // Falhou: esquece os ids pra que uma remontagem futura possa tentar de
      // novo, em vez de ficar preso em "pendente" pra sempre.
      if (batch.current.owner !== owner) return
      for (const id of ids) batch.current.known.delete(id)
    }
  }, [])

  const registerPost = useCallback(
    (postId: string) => {
      if (authLoading || !userId) return

      const b = batch.current
      if (b.owner !== userId) {
        // Primeiro registro desta sessão — zera o bookkeeping do dono anterior.
        b.owner = userId
        b.known = new Set()
        b.pending = new Set()
        b.scheduled = false
      }

      if (b.known.has(postId)) return
      b.known.add(postId)
      b.pending.add(postId)

      if (b.scheduled) return
      b.scheduled = true
      // Microtask: junta num lote só todos os cards que montaram no mesmo
      // commit do React.
      queueMicrotask(() => {
        void flush(userId)
      })
    },
    [authLoading, userId, flush]
  )

  const value = useMemo<AuraReactionsContextValue>(
    () => ({
      isPending: (postId: string) => Boolean(userId) && !current.resolved.has(postId),
      hasReacted: (postId: string) => current.reacted.has(postId),
      setReacted: (postId: string, reacted: boolean) => {
        batch.current.known.add(postId)
        setState((prev) => {
          const base: ReactionState =
            prev.ownerId === userId
              ? prev
              : { ownerId: userId, resolved: new Set<string>(), reacted: new Set<string>() }
          const nextResolved = new Set(base.resolved)
          nextResolved.add(postId)
          const nextReacted = new Set(base.reacted)
          if (reacted) nextReacted.add(postId)
          else nextReacted.delete(postId)
          return { ownerId: userId, resolved: nextResolved, reacted: nextReacted }
        })
      },
      registerPost,
    }),
    [current, userId, registerPost]
  )

  return <AuraReactionsContext.Provider value={value}>{children}</AuraReactionsContext.Provider>
}

export function useAuraReactions() {
  return useContext(AuraReactionsContext)
}
