"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"

type StoreFavoritesContextValue = {
  /** `true` até a lista voltar do servidor: o coração não mostra um estado que pode estar errado. */
  loading: boolean
  isFavorite: (productId: string) => boolean
  count: number
  /** Pede a lista (uma vez por sessão). Chamado pelos consumidores, não no layout. */
  ensureLoaded: () => void
  /** Favorita/desfavorita. Deslogado abre o login em vez de falhar calado. */
  toggle: (productId: string) => Promise<void>
}

const noop = () => {}

const StoreFavoritesContext = createContext<StoreFavoritesContextValue>({
  loading: false,
  isFavorite: () => false,
  count: 0,
  ensureLoaded: noop,
  toggle: async () => {},
})

/**
 * Favoritos da Loja do usuário atual, compartilhados por todos os corações da
 * página (cards, página do produto, contador do menu).
 *
 * Diferente de `SavedPostsProvider`, a lista só é pedida quando algum
 * consumidor chama `ensureLoaded`: o provider mora no layout raiz, e sem
 * isso toda página do site (fórum, perfil…) pagaria um GET de favoritos da
 * Loja sem mostrar coração nenhum.
 */
export function StoreFavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const pathname = usePathname()
  const router = useRouter()
  const userId = user?.id ?? null

  const [requested, setRequested] = useState(false)
  const [owned, setOwned] = useState<{ userId: string; ids: Set<string> } | null>(null)
  const inFlight = useRef(new Set<string>())
  /** Estado que o último clique pediu, por produto, enquanto há requisição pendente. */
  const desired = useRef(new Map<string, boolean>())

  useEffect(() => {
    if (!requested || authLoading || !userId) return
    let active = true
    fetch("/api/store/favorites", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { productIds?: string[] } | null) => {
        if (active) setOwned({ userId, ids: new Set(Array.isArray(data?.productIds) ? data.productIds : []) })
      })
      .catch(() => {
        if (active) setOwned({ userId, ids: new Set() })
      })
    return () => {
      active = false
    }
  }, [requested, authLoading, userId])

  // A lista é de quem a pediu: trocar de conta com a página aberta não herda a anterior.
  const ids = owned && owned.userId === userId ? owned.ids : null
  const loading = requested && (authLoading || (Boolean(userId) && ids === null))

  const ensureLoaded = useCallback(() => setRequested(true), [])

  const toggle = useCallback(
    async (productId: string) => {
      if (!userId) {
        toast("Entre na sua conta para salvar favoritos.")
        openLogin(pathname || "/loja")
        return
      }
      if (!ids) return

      const apply = (favorite: boolean) =>
        setOwned((prev) => {
          if (!prev || prev.userId !== userId) return prev
          const updated = new Set(prev.ids)
          if (favorite) updated.add(productId)
          else updated.delete(productId)
          return { userId, ids: updated }
        })

      // Vale o ÚLTIMO clique: o coração troca na hora a cada toque, mas só
      // existe uma requisição por produto de cada vez. Cliques durante ela só
      // mudam `desired`; ao voltar, o laço reenvia se o desejado mudou. Antes,
      // o clique com requisição pendente era descartado e o botão parecia travado.
      const before = ids.has(productId)
      apply(!before)
      desired.current.set(productId, !before)
      if (inFlight.current.has(productId)) return

      inFlight.current.add(productId)
      // Estado que o servidor confirmou por último; começa no de antes do clique.
      let confirmed = before
      try {
        while (desired.current.get(productId) !== confirmed) {
          const target = desired.current.get(productId) as boolean
          const res = await fetch("/api/store/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, favorite: target }),
          })
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null
            throw new Error(data?.error ?? "Não foi possível atualizar seus favoritos.")
          }
          confirmed = target
        }
        // O coração muda de cor e só: sem o atalho, quem favorita não sabe onde a lista mora.
        // `id` fixo por produto: o toast é substituído, não empilhado.
        if (confirmed && !before && pathname !== "/loja/favoritos") {
          toast.success("Adicionado aos favoritos", {
            id: `store-favorite-${productId}`,
            action: { label: "Ver favoritos", onClick: () => router.push("/loja/favoritos") },
          })
        }
      } catch (error) {
        apply(confirmed)
        toast.error(error instanceof Error ? error.message : "Não foi possível atualizar seus favoritos.")
      } finally {
        inFlight.current.delete(productId)
        desired.current.delete(productId)
      }
    },
    [userId, ids, openLogin, pathname, router]
  )

  const value = useMemo<StoreFavoritesContextValue>(
    () => ({
      loading,
      isFavorite: (productId: string) => ids?.has(productId) ?? false,
      count: ids?.size ?? 0,
      ensureLoaded,
      toggle,
    }),
    [loading, ids, ensureLoaded, toggle]
  )

  return <StoreFavoritesContext.Provider value={value}>{children}</StoreFavoritesContext.Provider>
}

/** Favoritos da Loja. Montar um consumidor já dispara o carregamento (uma vez por sessão). */
export function useStoreFavorites(): StoreFavoritesContextValue {
  const value = useContext(StoreFavoritesContext)
  const { ensureLoaded } = value
  useEffect(() => {
    ensureLoaded()
  }, [ensureLoaded])
  return value
}
