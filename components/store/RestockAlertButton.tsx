"use client"

import { useEffect, useState } from "react"
import { BellRing, BellOff, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAuthUser } from "@/components/providers/auth-context"

/**
 * "Avise-me quando voltar" de um produto esgotado.
 *
 * O aviso chega pelo sino de notificações do site (tipo `store_restock`),
 * disparado por trigger no banco quando o produto — ou a cor inscrita — sai do
 * estado esgotado. Por isso exige login: sem conta não há onde entregar.
 *
 * `variantId` null significa "qualquer cor". Quando o produto tem cores e a
 * esgotada é só a selecionada, a inscrição é dessa cor específica.
 */
export function RestockAlertButton({
  productId,
  variantId,
  variantLabel,
}: {
  productId: string
  variantId: string | null
  variantLabel: string | null
}) {
  const { user, loading: authLoading } = useAuthUser()
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  // Estado inicial: o que o usuário já assinou nesse produto. Refaz a cada
  // troca de cor, porque a inscrição é por (produto, cor).
  useEffect(() => {
    if (!user) {
      setReady(true)
      setSubscribed(false)
      return
    }
    let cancelled = false
    setReady(false)
    fetch(`/api/store/restock-alerts?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { product?: boolean; variantIds?: string[] } | null) => {
        if (cancelled || !data) return
        setSubscribed(variantId ? (data.variantIds ?? []).includes(variantId) : Boolean(data.product))
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [user, productId, variantId])

  async function toggle() {
    if (!user) {
      toast.error("Faça login para ser avisado quando o produto voltar.")
      return
    }
    setLoading(true)
    const next = !subscribed
    try {
      const res = await fetch("/api/store/restock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, variantId, subscribe: next }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar o aviso.")
      setSubscribed(next)
      toast.success(
        next
          ? variantLabel
            ? `Avisaremos quando "${variantLabel}" voltar.`
            : "Avisaremos quando o produto voltar."
          : "Aviso desativado."
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar o aviso.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      disabled={loading || authLoading || !ready}
      className="h-[46px] w-full gap-2 rounded-xl text-[15px] font-bold"
    >
      {loading ? (
        <Loader2 className="size-[18px] animate-spin" />
      ) : subscribed ? (
        <BellOff className="size-[18px]" />
      ) : (
        <BellRing className="size-[18px]" />
      )}
      {subscribed ? "Cancelar aviso" : "Avise-me quando voltar"}
    </Button>
  )
}
