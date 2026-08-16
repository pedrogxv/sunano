"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bookmark, ListChecks } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"

export function WishlistButton({ productId }: { productId: string }) {
  const { openLogin } = useAuthModal()
  const { user } = useAuthUser()
  const [wishlisted, setWishlisted] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      setWishlisted(false)
      return
    }
    let cancelled = false
    fetch(`/api/store/wishlist-toggle?productId=${productId}`)
      .then((res) => res.json())
      .then((data: { wishlisted?: boolean }) => {
        if (!cancelled) setWishlisted(Boolean(data.wishlisted))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [productId, user])

  async function toggle() {
    if (!user) {
      openLogin()
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/store/wishlist-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })
      if (res.status === 401) {
        openLogin()
        return
      }
      const data = (await res.json()) as { wishlisted?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar")
      setWishlisted(Boolean(data.wishlisted))
      toast.success(data.wishlisted ? "Salvo na lista de compras" : "Removido da lista de compras")
    } catch (err) {
      toast.error("Erro ao salvar na lista", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={toggle}
        disabled={loading}
        className={cn("shrink-0", wishlisted && "border-primary/40 bg-primary/10 text-primary")}
        aria-label={wishlisted ? "Remover da lista de compras" : "Salvar na lista de compras"}
      >
        <Bookmark className={cn("size-4", wishlisted && "fill-current")} />
      </Button>

      {wishlisted && (
        <Link
          href="/perfil/listas"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ListChecks className="size-3.5" />
          Ver minha lista
        </Link>
      )}
    </div>
  )
}
