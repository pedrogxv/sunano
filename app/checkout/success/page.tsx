"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { CheckCircle, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/lib/cart-context"
import { Suspense } from "react"

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")
  const { clear } = useCart()

  useEffect(() => {
    // Clear cart after successful payment
    clear()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/15">
        <CheckCircle className="size-10 text-emerald-400" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-black text-slate-50">Pagamento confirmado!</h1>
        <p className="text-slate-400 max-w-sm">
          Seu pedido foi recebido com sucesso. Você receberá um e-mail de confirmação em breve.
        </p>
      </div>

      {sessionId && (
        <p className="rounded-lg bg-white/[0.04] px-4 py-2 font-mono text-xs text-slate-500">
          ID: {sessionId}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/loja">
          <Button variant="outline" className="gap-2">
            <ShoppingBag className="size-4" />
            Continuar comprando
          </Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" className="text-slate-400">
            Voltar ao início
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
