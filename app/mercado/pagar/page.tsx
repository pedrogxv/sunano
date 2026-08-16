"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle, Copy, Loader2, Store, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/format"

interface ListingPaymentStatus {
  id: string
  status: "pending_review" | "active" | "rejected" | "sold" | "removed"
  fee_status: "waived" | "pending" | "paid"
  fee_cents: number
  pix_copy_paste: string | null
  pix_qr_code_base64: string | null
}

const POLL_INTERVAL_MS = 4000

function MarketPaymentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const listingId = searchParams.get("listingId")

  const [listing, setListing] = useState<ListingPaymentStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchListing = useCallback(async () => {
    if (!listingId) return
    try {
      const res = await fetch(`/api/market/listings/${listingId}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Anúncio não encontrado.")
      }
      const data = (await res.json()) as { ok: boolean; listing: ListingPaymentStatus }
      setListing(data.listing)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o anúncio.")
    }
  }, [listingId])

  useEffect(() => {
    if (!listingId) {
      setError("Anúncio não informado.")
      return
    }
    fetchListing()
    const interval = setInterval(fetchListing, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [listingId, fetchListing])

  function handleCopy() {
    if (!listing?.pix_copy_paste) return
    navigator.clipboard.writeText(listing.pix_copy_paste)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => router.push("/mercado")}>
          Voltar ao Mercado
        </Button>
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (listing.fee_status === "paid") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle className="size-10 text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-foreground">Pagamento confirmado!</h1>
          <p className="text-muted-foreground max-w-sm">
            Seu anúncio entrou na fila de moderação e fica visível assim que um admin aprovar.
          </p>
        </div>
        <Link href="/mercado/meus-anuncios">
          <Button variant="outline" className="gap-2">
            <Store className="size-4" />
            Ver meus anúncios
          </Button>
        </Link>
      </div>
    )
  }

  if (listing.status === "removed") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">Este anúncio não está mais disponível para pagamento.</p>
        <Link href="/mercado/novo">
          <Button variant="outline">Criar novo anúncio</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-foreground">Pague a taxa com PIX</h1>
        <p className="text-sm text-muted-foreground">
          Escaneie o QR code ou copie o código abaixo no app do seu banco.
        </p>
      </div>

      <div className="text-3xl font-black text-emerald-400">{formatBRL(listing.fee_cents)}</div>

      {listing.pix_qr_code_base64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.pix_qr_code_base64}
          alt="QR Code PIX"
          className="size-56 rounded-xl border border-border bg-white p-2"
        />
      )}

      {listing.pix_copy_paste && (
        <div className="w-full space-y-2">
          <div className="break-all rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {listing.pix_copy_paste}
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={handleCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copiado!" : "Copiar código PIX"}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Aguardando confirmação do pagamento...
      </div>
    </div>
  )
}

export default function MarketPaymentPage() {
  return (
    <Suspense>
      <MarketPaymentContent />
    </Suspense>
  )
}
