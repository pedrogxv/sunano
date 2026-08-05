"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Megaphone, Send, Users } from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type SentNotice = {
  title: string
  body: string
  link: string | null
  sentAt: string
  recipients: number
  read: number
}

type Target = { id: string; name: string }

const TITLE_MAX = 80
const BODY_MAX = 280

/** Valor do <Select> que representa "todo mundo" — string vazia não serve ao Radix. */
const EVERYONE = "__all__"

export default function AdminNotificationsPage() {
  usePageHeader("Avisos do sistema", "Envie um recado que aparece no sino de quem usa o site.")

  const [sent, setSent] = useState<SentNotice[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [link, setLink] = useState("")
  const [audience, setAudience] = useState(EVERYONE)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/notifications")
      const data = (await res.json()) as { sent?: SentNotice[]; targets?: Target[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setSent(data.sent ?? [])
      setTargets(data.targets ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toEveryone = audience === EVERYONE
  const recipientName = useMemo(
    () => targets.find((t) => t.id === audience)?.name ?? "",
    [targets, audience]
  )

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending

  async function send() {
    setSending(true)
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          link: link.trim(),
          userId: toEveryone ? "" : audience,
        }),
      })
      const data = (await res.json()) as { sentTo?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar")

      toast.success("Aviso enviado", {
        description: toEveryone
          ? `${data.sentTo} pessoa(s) receberam.`
          : `Enviado para ${recipientName}.`,
      })
      setTitle("")
      setBody("")
      setLink("")
      setConfirmOpen(false)
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar"
      toast.error("Erro ao enviar aviso", { description: message })
    } finally {
      setSending(false)
    }
  }

  // Broadcast não tem desfazer: quem já leu, já leu. O passo extra existe
  // só para o envio geral — mandar para uma pessoa só é reversível na prática.
  function handleSubmit() {
    if (toEveryone) {
      setConfirmOpen(true)
      return
    }
    send()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Formulário */}
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4 md:p-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="notice-title">Título</Label>
              <span className="text-xs text-muted-foreground">
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <Input
              id="notice-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Manutenção programada"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="notice-body">Mensagem</Label>
              <span className="text-xs text-muted-foreground">
                {body.length}/{BODY_MAX}
              </span>
            </div>
            <Textarea
              id="notice-body"
              value={body}
              maxLength={BODY_MAX}
              rows={4}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ex.: O site fica fora do ar sábado, das 14h às 16h."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-link">Link (opcional)</Label>
            <Input
              id="notice-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/changelog"
            />
            <p className="text-xs text-muted-foreground">
              Para onde a notificação leva ao ser clicada. Só caminhos do próprio site.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-audience">Enviar para</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger id="notice-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERYONE}>
                  Todos os usuários ({targets.length})
                </SelectItem>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSubmit} disabled={!canSend} className="w-full sm:w-auto">
            <Send className="size-4" />
            {sending ? "Enviando..." : toEveryone ? "Enviar para todos" : "Enviar"}
          </Button>
        </div>

        {/* Prévia — mostra exatamente como cai no sino. */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Prévia
          </p>
          <div className="rounded-xl border border-border bg-popover p-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Megaphone className="size-[14px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">
                  {title.trim() || "Título do aviso"}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {body.trim() || "A mensagem aparece aqui."}
                </p>
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">agora</span>
              </div>
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Enviados recentemente</h2>
        {sent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum aviso enviado ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {sent.map((notice) => (
              <li
                key={`${notice.sentAt}-${notice.title}`}
                className="flex items-start gap-3 bg-card/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{notice.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{notice.body}</p>
                  <span className="mt-1 block text-[11px] text-muted-foreground/70">
                    {new Date(notice.sentAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {notice.read}/{notice.recipients} lidas
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para todos?</DialogTitle>
            <DialogDescription>
              O aviso vai para {targets.length} pessoa(s) de uma vez e não dá para desfazer depois
              que for lido.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium text-foreground">{title.trim()}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{body.trim()}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={send} disabled={sending}>
              {sending ? "Enviando..." : "Confirmar envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
