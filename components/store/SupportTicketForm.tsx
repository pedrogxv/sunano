"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2, ImagePlus, LifeBuoy, Loader2, LogIn, Search, ShoppingBag, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useUserOrders } from "@/lib/hooks/use-user-orders"
import { useSubmitShortcutLabel, isSubmitShortcut } from "@/lib/hooks/use-submit-shortcut"
import { orderNumber } from "@/lib/order-number"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Espelha MAX_SUPPORT_IMAGES_PER_MESSAGE de lib/server/support-media.ts — não pode importar `server-only` num client component. */
const MAX_SUPPORT_IMAGES = 3

type ProductOption = {
  id: string
  name: string
  slug: string
  images?: string[]
  brand?: string | null
  price_cents?: number
  promo_price_cents?: number | null
}

export function SupportTicketForm() {
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const { orders } = useUserOrders()

  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [orderId, setOrderId] = useState<string>("")
  const [productQuery, setProductQuery] = useState("")
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [productSearchLoading, setProductSearchLoading] = useState(false)
  const [productSearched, setProductSearched] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedTicket, setSubmittedTicket] = useState<{ id: string; subject: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const shortcutLabel = useSubmitShortcutLabel()

  useEffect(() => {
    if (selectedProduct || productQuery.trim().length < 2) {
      setProductOptions([])
      setProductSearchLoading(false)
      setProductSearched(false)
      return
    }
    const controller = new AbortController()
    setProductSearchLoading(true)
    const timeout = setTimeout(() => {
      fetch(`/api/store/search?q=${encodeURIComponent(productQuery.trim())}&limit=6`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items?: ProductOption[] }) => setProductOptions(data.items ?? []))
        .catch(() => {})
        .finally(() => {
          setProductSearchLoading(false)
          setProductSearched(true)
        })
    }, 300)
    return () => {
      clearTimeout(timeout)
      controller.abort()
      setProductSearchLoading(false)
    }
  }, [productQuery, selectedProduct])

  async function handleFile(file: File) {
    if (imageUrls.length >= MAX_SUPPORT_IMAGES) {
      toast.error(`Máximo de ${MAX_SUPPORT_IMAGES} imagens.`)
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/support/upload-image", { method: "POST", body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.publicUrl) {
        toast.error(data?.error ?? "Erro ao enviar imagem.")
        return
      }
      setImageUrls((prev) => [...prev, data.publicUrl])
    } catch {
      toast.error("Erro ao enviar imagem.")
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          orderId: orderId || null,
          productId: selectedProduct?.id ?? null,
          imageUrls,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível abrir o chamado.")
        return
      }
      setSubmittedTicket({ id: data.ticketId, subject: subject.trim() })
    } catch {
      toast.error("Não foi possível abrir o chamado.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitShortcut(event)) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="flex animate-in fade-in-0 slide-in-from-bottom-2 flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center duration-300">
        <p className="text-sm text-muted-foreground">Entre na sua conta para abrir um chamado de suporte.</p>
        <Button type="button" className="gap-2" onClick={() => openLogin("/suporte")}>
          <LogIn className="size-4" />
          Entrar
        </Button>
      </div>
    )
  }

  if (submittedTicket) {
    return (
      <div className="flex animate-in fade-in-0 zoom-in-95 flex-col items-center gap-4 rounded-xl border border-border bg-muted/20 px-6 py-12 text-center duration-300">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="size-7 text-emerald-400" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">Chamado aberto com sucesso!</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            &ldquo;{submittedTicket.subject}&rdquo; foi registrado. Nossa equipe vai responder por aqui mesmo em breve.
          </p>
        </div>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <Button asChild className="gap-2">
            <Link href={`/conta/suporte/${submittedTicket.id}`}>
              <LifeBuoy className="size-4" />
              Ver este chamado
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/conta/suporte">Ver meus tickets</Link>
          </Button>
          <Button asChild variant="ghost" className="gap-2">
            <Link href="/loja">
              <ShoppingBag className="size-4" />
              Voltar à loja
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex animate-in fade-in-0 flex-col gap-5 duration-300">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="suporte-assunto">Assunto</Label>
          <RequiredBadge />
        </div>
        <Input
          id="suporte-assunto"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex: Produto chegou com defeito"
          minLength={3}
          maxLength={140}
          required
        />
      </div>

      {orders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Pedido relacionado</Label>
            <OptionalBadge />
          </div>
          <Select value={orderId || "none"} onValueChange={(v) => setOrderId(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Nenhum pedido selecionado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {orders.map((order) => (
                <SelectItem key={order.id} value={order.id}>
                  #{orderNumber(order.id)} · {formatBRL(order.total_cents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="suporte-produto">Produto relacionado</Label>
          <OptionalBadge />
        </div>
        {selectedProduct ? (
          <div className="flex animate-in fade-in-0 zoom-in-95 items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 duration-200">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                {selectedProduct.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedProduct.images[0]} alt="" className="size-full object-cover" />
                ) : (
                  <Search className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{selectedProduct.name}</span>
                {typeof selectedProduct.price_cents === "number" && (
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(selectedProduct.promo_price_cents ?? selectedProduct.price_cents)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Remover produto"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="suporte-produto"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Buscar produto da loja..."
              className="pl-8 pr-8"
              autoComplete="off"
            />
            {productSearchLoading && (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {(productOptions.length > 0 || (productSearched && !productSearchLoading && productQuery.trim().length >= 2)) && (
              <div className="absolute z-10 mt-1 max-h-80 w-full animate-in fade-in-0 slide-in-from-top-1 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg duration-150">
                {productOptions.length > 0
                  ? productOptions.map((product) => {
                      const price = product.promo_price_cents ?? product.price_cents
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setSelectedProduct(product)
                            setProductQuery("")
                            setProductOptions([])
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                            "border-b border-border/60 last:border-b-0"
                          )}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                            {product.images?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={product.images[0]} alt="" className="size-full object-cover" />
                            ) : (
                              <Search className="size-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm text-foreground">{product.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[product.brand, typeof price === "number" ? formatBRL(price) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        </button>
                      )
                    })
                  : !productSearchLoading && (
                      <p className="px-3 py-3 text-center text-sm text-muted-foreground">
                        Nenhum produto encontrado para &ldquo;{productQuery.trim()}&rdquo;.
                      </p>
                    )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="suporte-mensagem">Mensagem</Label>
          <RequiredBadge />
        </div>
        <Textarea
          id="suporte-mensagem"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Descreve o que está acontecendo..."
          className="min-h-32"
          maxLength={4000}
          required
        />
      </div>

      {imageUrls.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative animate-in fade-in-0 zoom-in-95 duration-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Anexo" className="size-16 rounded-lg border border-border object-cover" />
              <button
                type="button"
                onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border transition-colors hover:text-foreground"
                aria-label="Remover anexo"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {imageUrls.length < MAX_SUPPORT_IMAGES && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 transition-transform active:scale-95"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                Anexar imagem
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">Até {MAX_SUPPORT_IMAGES} imagens (JPG, PNG, WEBP ou GIF).</span>
        </div>

        <Button type="submit" className="gap-2 transition-transform active:scale-[0.98]" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? "Abrindo chamado..." : "Abrir chamado"}
          {!submitting && (
            <kbd className="ml-1 rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] font-medium leading-none">
              {shortcutLabel}+Enter
            </kbd>
          )}
        </Button>
      </div>
    </form>
  )
}

function RequiredBadge() {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Obrigatório</span>
  )
}

function OptionalBadge() {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Opcional</span>
  )
}
