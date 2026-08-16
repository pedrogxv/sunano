"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { coerceAccountTier } from "@/lib/account-tier"
import { calculateListingFee } from "@/lib/market-fees"

type MyListing = { status: string; is_free_vip_slot: boolean }

export function MarketListingForm() {
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fee, setFee] = useState<{ feeCents: number; isFreeVipSlot: boolean } | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priceBrl, setPriceBrl] = useState("")
  const [olxUrl, setOlxUrl] = useState("")
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    async function loadFeeInputs() {
      try {
        const [profileRes, mineRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/market/listings?mine=1"),
        ])
        const profileData = (await profileRes.json()) as { profile?: { account_tier?: string } }
        const mineData = (await mineRes.json()) as { listings?: MyListing[] }
        if (!mounted) return

        const tier = coerceAccountTier(profileData.profile?.account_tier)
        const occupiesFreeSlot = (mineData.listings ?? []).some(
          (l) => l.is_free_vip_slot && (l.status === "pending_review" || l.status === "active")
        )

        const priceCents = Math.round(parseFloat(priceBrl.replace(",", ".")) * 100)
        setFee(calculateListingFee(Number.isFinite(priceCents) ? priceCents : 0, { tier, occupiesFreeSlot }))
      } catch {
        // Sem sessão ou erro de rede: mantém sem preview, o servidor calcula
        // a taxa de qualquer forma na hora de submeter.
      }
    }
    loadFeeInputs()
    return () => { mounted = false }
  }, [priceBrl])

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData()
    fd.set("file", file)
    const res = await fetch("/api/market/upload-image", { method: "POST", body: fd })
    const data = (await res.json()) as { ok?: boolean; publicUrl?: string; error?: string }
    if (!res.ok || !data.ok || !data.publicUrl) {
      throw new Error(data.error ?? "Erro ao enviar imagem")
    }
    return data.publicUrl
  }

  async function handleImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const url = await uploadImage(file)
      setImages((prev) => [...prev, url])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!title.trim()) throw new Error("Informe o título do anúncio.")

      const priceCents = Math.round(parseFloat(priceBrl.replace(",", ".")) * 100)
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new Error("Preço inválido. Use um valor maior que zero (ex: 159,90).")
      }
      if (!olxUrl.trim()) throw new Error("Informe o link do anúncio na OLX.")

      const res = await fetch("/api/market/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          price_cents: priceCents,
          olx_url: olxUrl.trim(),
          images,
        }),
      })

      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        requiresPayment?: boolean
        listingId?: string
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao criar anúncio")
      }

      if (data.requiresPayment && data.listingId) {
        router.push(`/mercado/pagar?listingId=${data.listingId}`)
        return
      }

      toast.success("Anúncio enviado para moderação", {
        description: "Ele fica visível assim que um admin aprovar.",
      })
      router.push("/mercado/meus-anuncios")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar anúncio"
      setError(message)
      toast.error("Erro ao criar anúncio", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Título do anúncio *</Label>
        <Input
          required
          minLength={2}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Logitech G Pro X Superlight 2, usado"
        />
      </div>

      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Estado de conservação, motivo da venda, acessórios inclusos..."
          rows={4}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Preço (R$) *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              required
              type="text"
              inputMode="decimal"
              value={priceBrl}
              onChange={(e) => setPriceBrl(e.target.value)}
              placeholder="0,00"
              className="pl-9"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Depois de publicado, o preço só pode ser reduzido — nunca aumentado. Tentar aumentar
            pode resultar em banimento do Mercado.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Link do anúncio na OLX *</Label>
          <Input
            required
            type="url"
            value={olxUrl}
            onChange={(e) => setOlxUrl(e.target.value)}
            placeholder="https://www.olx.com.br/..."
          />
          <p className="text-[10px] text-muted-foreground/60">
            Obrigatório — é para lá que o comprador vai negociar com você.
          </p>
        </div>
      </div>

      {fee && (
        <div className={cn(
          "rounded-xl border px-4 py-3 text-sm",
          fee.isFreeVipSlot
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
            : "border-amber-500/30 bg-amber-500/5 text-amber-300"
        )}>
          {fee.isFreeVipSlot
            ? "Você tem direito a 1 anúncio grátis como VIP — esta publicação não terá custo."
            : `Taxa de publicação (5% do valor anunciado): ${formatBRL(fee.feeCents)}. Cobrada agora, na criação do anúncio.`}
        </div>
      )}

      <div className="space-y-3">
        <Label>Imagens</Label>
        <div className="flex flex-wrap gap-3">
          {images.map((url, idx) => (
            <div key={url} className="group relative size-24 overflow-hidden rounded-xl border border-border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Imagem ${idx + 1}`} className="h-full w-full object-contain p-1" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-2.5 text-white" />
              </button>
              {idx === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-white">
                  Principal
                </span>
              )}
            </div>
          ))}

          <label className={cn(
            "flex size-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:text-foreground/80",
            uploading && "cursor-wait opacity-50"
          )}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageAdd}
              disabled={uploading}
            />
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Plus className="size-5" />
                <span className="text-[9px]">Adicionar</span>
              </>
            )}
          </label>
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" disabled={loading || uploading} className="gap-2">
          {loading && <Loader2 className="size-4 animate-spin" />}
          <Upload className="size-4" />
          Publicar anúncio
        </Button>
      </div>
    </form>
  )
}
