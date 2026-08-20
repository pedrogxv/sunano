"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ImagePlus, Loader2, Package, ShoppingBag, Star, X } from "lucide-react"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { useSupportTicket } from "@/lib/hooks/use-support-ticket"
import { useSubmitShortcutLabel, isSubmitShortcut } from "@/lib/hooks/use-submit-shortcut"
import { cn } from "@/lib/utils"

/** Espelha MAX_SUPPORT_IMAGES_PER_MESSAGE de lib/server/support-media.ts — não pode importar `server-only` num client component. */
const MAX_SUPPORT_IMAGES = 3

const STATUS_LABEL = { open: "Aberto", resolved: "Resolvido", cancelled: "Cancelado" } as const
const STATUS_STYLE = {
  open: "bg-sky-500/15 text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
} as const

function RatingWidget({ ticketId, onRated }: { ticketId: string; onRated: () => void }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (rating === 0 || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível registrar sua avaliação.")
        return
      }
      toast.success("Obrigado pela avaliação!")
      onRated()
    } catch {
      toast.error("Não foi possível registrar sua avaliação.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <p className="text-sm font-medium text-foreground">Como foi seu atendimento?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            onMouseEnter={() => setHover(value)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${value} estrelas`}
          >
            <Star
              className={cn(
                "size-6 transition-colors",
                value <= (hover || rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
              )}
            />
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentário (opcional)"
        maxLength={500}
        className="min-h-16"
      />
      <Button size="sm" disabled={rating === 0 || submitting} onClick={submit}>
        {submitting ? <Loader2 className="size-4 animate-spin" /> : "Enviar avaliação"}
      </Button>
    </div>
  )
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>()
  const ticketId = params.id
  const { profile, loading: profileLoading } = useOwnProfile()
  const { ticket, messages, loading, notFound, reload } = useSupportTicket(ticketId)

  const [body, setBody] = useState("")
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shortcutLabel = useSubmitShortcutLabel()

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

  async function sendMessage() {
    if (!body.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), imageUrls }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível enviar a mensagem.")
        // 409 aqui significa que o estado local ficou desatualizado (ex.: o
        // suporte respondeu ou o ticket foi encerrado enquanto a aba estava
        // parada) — recarrega pra refletir a realidade e esconder/desabilitar
        // o formulário em vez de deixar o usuário tentar de novo às cegas.
        if (res.status === 409) reload()
        return
      }
      setBody("")
      setImageUrls([])
      reload()
    } catch {
      toast.error("Não foi possível enviar a mensagem.")
    } finally {
      setSending(false)
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitShortcut(event)) {
      event.preventDefault()
      void sendMessage()
    }
  }

  if (profileLoading || !profile || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  if (notFound || !ticket) {
    return (
      <div className="pb-16">
        <AccountPageHeader profile={profile} />
        <div className="mx-auto max-w-2xl px-2 py-16 text-center sm:px-4 md:px-6">
          <p className="text-sm text-muted-foreground">Chamado não encontrado.</p>
          <Link href="/conta/suporte" className="mt-2 inline-block text-xs font-medium text-emerald-400 hover:underline">
            Voltar para Meus Tickets
          </Link>
        </div>
      </div>
    )
  }

  const canReply = ticket.status === "open" && ticket.waiting_on === "user"

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-2xl space-y-6 px-2 py-8 sm:px-4 md:px-6">
        <div>
          <Link href="/conta/suporte" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            ← Meus Tickets
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[ticket.status])}>
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-foreground">{ticket.subject}</h1>

          {(ticket.order_number || ticket.product_name) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {ticket.order_number && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                  <Package className="size-3.5" />
                  Pedido #{ticket.order_number}
                </span>
              )}
              {ticket.product_name && ticket.product_slug && (
                <Link
                  href={`/loja/${ticket.product_slug}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1 text-xs text-primary hover:underline"
                >
                  <ShoppingBag className="size-3.5" />
                  {ticket.product_name}
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-xl border p-3",
                message.sender_type === "user" ? "ml-auto border-primary/30 bg-primary/10" : "border-border bg-card"
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{message.sender_name}</span>
                <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ptBR })}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
              {message.image_urls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.image_urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Anexo" className="size-20 rounded-lg border border-border object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {ticket.status === "open" && (
          <div className="rounded-xl border border-border bg-card p-4">
            {canReply ? (
              <div className="space-y-3">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Escreva sua mensagem..."
                  className="min-h-24"
                  maxLength={4000}
                />
                {imageUrls.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {imageUrls.map((url) => (
                      <div key={url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Anexo" className="size-14 rounded-lg border border-border object-cover" />
                        <button
                          type="button"
                          onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground"
                          aria-label="Remover anexo"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {imageUrls.length < MAX_SUPPORT_IMAGES ? (
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
                        className="gap-1.5"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                        Anexar imagem
                      </Button>
                    </>
                  ) : (
                    <span />
                  )}
                  <Button size="sm" className="gap-2" disabled={!body.trim() || sending} onClick={sendMessage}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> : "Enviar"}
                    {!sending && (
                      <kbd className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                        {shortcutLabel}+Enter
                      </kbd>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">Aguardando resposta do suporte...</p>
            )}
          </div>
        )}

        {ticket.status !== "open" && ticket.rating === null && (
          <RatingWidget ticketId={ticket.id} onRated={reload} />
        )}

        {ticket.status !== "open" && ticket.rating !== null && (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-sm text-foreground">
              Sua avaliação: {"★".repeat(ticket.rating)}
              {"☆".repeat(5 - ticket.rating)}
            </p>
            {ticket.rating_comment && (
              <p className="mt-1 text-xs text-muted-foreground">&ldquo;{ticket.rating_comment}&rdquo;</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
