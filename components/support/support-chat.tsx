"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BadgeCheck,
  CheckCircle2,
  CircleCheckBig,
  Clock,
  ImagePlus,
  MessageCircleReply,
  Loader2,
  Send,
  X,
  XCircle,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { Textarea } from "@/components/ui/textarea"
import type { SupportMessageRow } from "@/lib/hooks/use-support-ticket"
import {
  useSubmitShortcutLabel,
  isSubmitShortcut,
} from "@/lib/hooks/use-submit-shortcut"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { cn } from "@/lib/utils"

/**
 * Peças da conversa de suporte do lado do CLIENTE, compartilhadas pela página
 * do chamado (`/conta/suporte/[id]`) e pelo painel do botão flutuante
 * (`SupportFab`). Uma cópia em cada tela era o caminho para o envio, o upload
 * e o tratamento do 409 divergirem entre as duas.
 */

/** Espelha MAX_SUPPORT_IMAGES_PER_MESSAGE de lib/server/support-media.ts — não pode importar `server-only` num client component. */
export const MAX_SUPPORT_IMAGES = 3

export const RATING_LABEL = ["", "Muito ruim", "Ruim", "Ok", "Bom", "Excelente"] as const

/**
 * Estado do chamado do ponto de vista do CLIENTE — a fonte única de rótulo,
 * ícone e cor para a lista, a página do chamado e o painel do botão
 * flutuante. "Aberto" sozinho não diz nada a quem lê: o que importa é se a
 * vez é dele ou da equipe.
 */
export type TicketState = "your_turn" | "in_review" | "resolved" | "cancelled"

export function ticketStateOf(ticket: { status: string; waiting_on: string }): TicketState {
  if (ticket.status === "resolved") return "resolved"
  if (ticket.status === "cancelled") return "cancelled"
  return ticket.waiting_on === "user" ? "your_turn" : "in_review"
}

export const TICKET_STATE_META: Record<
  TicketState,
  { label: string; icon: React.ElementType; pill: string; tile: string; dot: string }
> = {
  your_turn: {
    label: "Sua vez",
    icon: MessageCircleReply,
    pill: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    tile: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
    dot: "bg-amber-400",
  },
  in_review: {
    label: "Em análise",
    icon: Clock,
    pill: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    tile: "bg-sky-500/15 text-sky-400 ring-sky-500/30",
    dot: "bg-sky-400",
  },
  resolved: {
    label: "Resolvido",
    icon: CheckCircle2,
    pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    tile: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    pill: "border-border bg-muted/60 text-muted-foreground",
    tile: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground",
  },
}

export function TicketStatePill({ state, className }: { state: TicketState; className?: string }) {
  const meta = TICKET_STATE_META[state]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        meta.pill,
        className
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}

/** Mensagens seguidas do mesmo remetente em até 10 min viram um bloco só (foto e nome uma vez). */
const GROUP_WINDOW_MS = 10 * 60_000

function dayKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("pt-BR")
}

function dayLabel(iso: string): string {
  const key = dayKey(iso)
  if (key === dayKey(new Date())) return "Hoje"
  if (key === dayKey(new Date(Date.now() - 86_400_000))) return "Ontem"
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function relativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
}

/** Fundo pontilhado da área de mensagens. */
export const CHAT_DOTS_STYLE = {
  backgroundImage:
    "radial-gradient(color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px)",
  backgroundSize: "18px 18px",
} as const

/** Avatar da equipe: o mascote da casa, no lugar de uma foto pessoal. */
export function TeamAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/25 to-violet-500/25 ring-1 ring-sky-400/30",
        className
      )}
    >
      <SunanoIcon className="size-6" />
    </span>
  )
}

export type SupportChatIdentity = {
  name: string
  avatarUrl: string | null | undefined
  frame: ProfileFrameIdentity
}

/** Bolhas da conversa: o cliente à direita, a equipe (mascote) à esquerda. */
export function SupportMessageList({
  messages,
  me,
  closedStatus,
  compact = false,
  className,
}: {
  messages: SupportMessageRow[]
  me: SupportChatIdentity
  /** Chamado encerrado: fecha a conversa com o marcador de resolvido/cancelado. */
  closedStatus: "resolved" | "cancelled" | null
  /** Versão do painel flutuante: bolhas e anexos menores. */
  compact?: boolean
  className?: string
}) {
  return (
    <ol className={className} style={CHAT_DOTS_STYLE}>
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const mine = message.sender_type === "user"
        const newDay =
          !previous ||
          dayKey(previous.created_at) !== dayKey(message.created_at)
        const grouped =
          !newDay &&
          previous.sender_type === message.sender_type &&
          new Date(message.created_at).getTime() -
            new Date(previous.created_at).getTime() <
            GROUP_WINDOW_MS

        return (
          <li
            key={message.id}
            className={cn(index > 0 && (grouped ? "mt-1.5" : "mt-5"))}
          >
            {newDay && (
              <div
                className={cn(
                  "mb-5 flex items-center gap-3",
                  index > 0 && "mt-2"
                )}
              >
                <span className="h-px flex-1 bg-border" />
                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {dayLabel(message.created_at)}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}

            <div
              className={cn(
                "flex items-start gap-2.5 sm:gap-3",
                mine && "flex-row-reverse"
              )}
            >
              <div className="w-8 shrink-0">
                {!grouped &&
                  (mine ? (
                    <ProfileAvatar
                      name={me.name}
                      avatarUrl={me.avatarUrl}
                      frame={me.frame}
                      size="sm"
                    />
                  ) : (
                    <TeamAvatar />
                  ))}
              </div>

              <div
                className={cn(
                  "flex min-w-0 flex-col",
                  compact ? "max-w-[85%]" : "max-w-[85%] sm:max-w-[75%]",
                  mine ? "items-end" : "items-start"
                )}
              >
                {!grouped && (
                  <div
                    className={cn(
                      "mb-1.5 flex items-center gap-1.5 px-0.5",
                      mine && "flex-row-reverse"
                    )}
                  >
                    <span className="text-[13px] font-semibold text-foreground">
                      {mine ? "Você" : message.sender_name}
                    </span>
                    {!mine && (
                      <BadgeCheck
                        className="size-3.5 text-sky-400"
                        aria-label="Equipe Sunano"
                      />
                    )}
                    <time
                      dateTime={message.created_at}
                      title={new Date(message.created_at).toLocaleString(
                        "pt-BR"
                      )}
                      className="text-[11px] text-muted-foreground tabular-nums"
                    >
                      {formatTime(message.created_at)}
                    </time>
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:px-4",
                    mine
                      ? "rounded-tr-md bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-950/40"
                      : "rounded-tl-md border border-border bg-card text-foreground shadow-sm"
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">
                    {message.body}
                  </p>
                  {message.image_urls.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {message.image_urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-lg ring-1 ring-white/15 transition-opacity hover:opacity-80"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Anexo"
                            className={cn(
                              "object-cover",
                              compact ? "size-16" : "size-20 sm:size-24"
                            )}
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </li>
        )
      })}

      {closedStatus && (
        <li className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
            {closedStatus === "resolved" ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <XCircle className="size-3" />
            )}
            Chamado {closedStatus === "resolved" ? "resolvido" : "cancelado"}
          </span>
          <span className="h-px flex-1 bg-border" />
        </li>
      )}
    </ol>
  )
}

/**
 * Caixa de resposta do cliente. O 409 da rota quer dizer que o estado local
 * ficou velho (a equipe respondeu ou encerrou enquanto a aba estava parada):
 * `onConflict` recarrega para esconder o formulário em vez de deixar a pessoa
 * tentar de novo às cegas.
 */
export function SupportReplyComposer({
  ticketId,
  onSent,
  onConflict,
  compact = false,
}: {
  ticketId: string
  onSent: () => void
  onConflict: () => void
  compact?: boolean
}) {
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
      const res = await fetch("/api/support/upload-image", {
        method: "POST",
        body: formData,
      })
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
        if (res.status === 409) onConflict()
        return
      }
      setBody("")
      setImageUrls([])
      onSent()
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

  return (
    <div
      className={cn("border-t border-border", compact ? "p-2.5" : "p-3 sm:p-4")}
    >
      <div className="overflow-hidden rounded-xl border border-border bg-background/40 transition-colors focus-within:border-ring">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Escreva sua mensagem..."
          className={cn(
            "resize-none rounded-none border-0 bg-transparent px-3.5 py-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
            compact ? "max-h-40 min-h-16" : "max-h-72 min-h-24"
          )}
          maxLength={4000}
        />
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3">
            {imageUrls.map((url) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Anexo"
                  className="size-14 rounded-lg border border-border object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <button
                  type="button"
                  onClick={() =>
                    setImageUrls((prev) => prev.filter((u) => u !== url))
                  }
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground"
                  aria-label="Remover anexo"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-2 py-2">
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
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" />
                )}
                Anexar imagem
              </Button>
            </>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">
              Máximo de {MAX_SUPPORT_IMAGES} imagens
            </span>
          )}
          <Button
            size="sm"
            className="gap-2"
            disabled={!body.trim() || sending}
            onClick={sendMessage}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Enviar
            {!sending && (
              <kbd className="hidden rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] leading-none font-medium sm:inline">
                {shortcutLabel}+Enter
              </kbd>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * O cliente encerra o próprio chamado ("meu problema foi resolvido"), atrás
 * de confirmação: encerrar fecha a conversa, e só a equipe reabre.
 */
export function CloseTicketButton({
  ticketId,
  onClosed,
  className,
  size = "default",
}: {
  ticketId: string
  onClosed: () => void
  className?: string
  size?: "default" | "sm"
}) {
  const [closing, setClosing] = useState(false)

  async function close() {
    setClosing(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/close`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível encerrar o chamado.")
        return
      }
      toast.success("Chamado encerrado")
      onClosed()
    } catch {
      toast.error("Não foi possível encerrar o chamado.")
    } finally {
      setClosing(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={closing}
          className={cn(
            "gap-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300",
            className
          )}
        >
          {closing ? <Loader2 className="size-4 animate-spin" /> : <CircleCheckBig className="size-4" />}
          Encerrar chamado
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Seu problema foi resolvido?</AlertDialogTitle>
          <AlertDialogDescription>
            O chamado será encerrado e a conversa fecha. Se precisar de ajuda de novo, é só abrir um novo chamado
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={closing}>Ainda não</AlertDialogCancel>
          <AlertDialogAction onClick={() => void close()} disabled={closing}>
            Sim, encerrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
