"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Copy, Globe, Loader2, Lock, Package, Plus, Trash2 } from "lucide-react"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"

interface Wishlist {
  id: string
  name: string
  is_default: boolean
  is_public: boolean
  share_token: string | null
  item_count?: number
}

interface WishlistItem {
  id: string
  product_id: string
  note: string | null
  product: {
    slug: string
    name: string
    type: "store" | "bazaar"
    price_cents: number
    images: string[]
  } | null
}

export default function MyWishlistsPage() {
  const [wishlists, setWishlists] = useState<Wishlist[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<WishlistItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/store/wishlists")
      const data = (await res.json()) as { wishlists?: Wishlist[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar listas")
      setWishlists(data.wishlists ?? [])
      if (data.wishlists && data.wishlists.length > 0 && !activeId) {
        setActiveId(data.wishlists[0].id)
      }
    } catch (err) {
      toast.error("Erro ao carregar listas", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const loadItems = useCallback(async (id: string) => {
    setItemsLoading(true)
    try {
      const res = await fetch(`/api/store/wishlists/${id}`)
      const data = (await res.json()) as { items?: WishlistItem[] }
      setItems(data.items ?? [])
    } finally {
      setItemsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeId) loadItems(activeId)
  }, [activeId, loadItems])

  async function togglePublic(list: Wishlist) {
    try {
      const res = await fetch(`/api/store/wishlists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !list.is_public }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar")
      toast.success(list.is_public ? "Lista tornada privada" : "Lista tornada pública")
      load()
    } catch (err) {
      toast.error("Erro ao atualizar lista", { description: err instanceof Error ? err.message : undefined })
    }
  }

  function copyShareLink(list: Wishlist) {
    if (!list.share_token) return
    const url = `${window.location.origin}/lista-de-desejos/${list.share_token}`
    navigator.clipboard.writeText(url)
    toast.success("Link copiado!")
  }

  async function createList() {
    if (!newListName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/store/wishlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim() }),
      })
      const data = (await res.json()) as { wishlist?: Wishlist; error?: string }
      if (!res.ok || !data.wishlist) throw new Error(data.error ?? "Erro ao criar lista")
      setNewListName("")
      toast.success("Lista criada")
      load()
    } catch (err) {
      toast.error("Erro ao criar lista", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setCreating(false)
    }
  }

  async function deleteList(list: Wishlist) {
    if (list.is_default) return
    try {
      const res = await fetch(`/api/store/wishlists/${list.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar lista")
      toast.success("Lista deletada")
      setActiveId(null)
      load()
    } catch (err) {
      toast.error("Erro ao deletar lista", { description: err instanceof Error ? err.message : undefined })
    }
  }

  async function removeItem(productId: string) {
    if (!activeId) return
    try {
      await fetch(`/api/store/wishlists/${activeId}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
      setItems((prev) => prev.filter((i) => i.product_id !== productId))
      load()
    } catch {
      toast.error("Erro ao remover item")
    }
  }

  const activeList = wishlists.find((w) => w.id === activeId)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-black tracking-tight text-foreground">Minhas listas de compras</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Salve produtos para depois e, se quiser, compartilhe uma lista pública com outras pessoas.
      </p>

      <div className="mt-6 flex gap-2">
        <Input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !creating && newListName.trim()) createList()
          }}
          placeholder="Nome da nova lista (ex: Setup dos sonhos)"
          className="border-border bg-background"
        />
        <Button
          onClick={createList}
          disabled={creating || !newListName.trim()}
          className="shrink-0 gap-1.5"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Nova lista
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {wishlists.map((list) => (
          <button
            key={list.id}
            onClick={() => setActiveId(list.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              activeId === list.id
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {list.name} <span className="text-xs opacity-60">({list.item_count ?? 0})</span>
          </button>
        ))}
      </div>

      {activeList && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/10 px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => togglePublic(activeList)}
            >
              {activeList.is_public ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
              {activeList.is_public ? "Pública" : "Privada"}
            </Button>

            {activeList.is_public && activeList.share_token && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyShareLink(activeList)}>
                <Copy className="size-3.5" />
                Copiar link
              </Button>
            )}

            {!activeList.is_default && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-red-500/70 hover:text-red-400"
                onClick={() => deleteList(activeList)}
              >
                <Trash2 className="size-3.5" />
                Deletar lista
              </Button>
            )}
          </div>

          {itemsLoading ? (
            <div className="flex justify-center py-10">
              <BoxLoader />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-14 text-center">
              <Package className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum produto salvo nesta lista ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) =>
                item.product ? (
                  <div key={item.id} className="group relative overflow-hidden rounded-xl border border-border bg-card">
                    <button
                      onClick={() => removeItem(item.product_id)}
                      className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <Link href={`/${item.product.type === "bazaar" ? "bazar" : "loja"}/${item.product.slug}`}>
                      <div className="aspect-square bg-muted">
                        {item.product.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.images[0]} alt={item.product.name} className="h-full w-full object-contain p-3" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="size-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="line-clamp-2 text-xs font-bold text-foreground/90">{item.product.name}</p>
                        <p className="mt-1 text-sm font-black text-emerald-400">{formatBRL(item.product.price_cents)}</p>
                      </div>
                    </Link>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
