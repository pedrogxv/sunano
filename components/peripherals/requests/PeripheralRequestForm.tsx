"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2, ExternalLink, Loader2, LogIn, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useSubmitShortcutLabel, isSubmitShortcut } from "@/lib/hooks/use-submit-shortcut"
import { MAX_OPEN_PERIPHERAL_REQUESTS, PERIPHERAL_REQUEST_LIMITS, peripheralRequestNumber } from "@/lib/peripheral-requests"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"
import { ALL_CATEGORIES, CATEGORY_PLURAL_LABELS, type Category } from "@/lib/tag-options"

type CatalogMatch = { id: string; name: string; brand: string; category: string }

type Created = { id: string; number: number | null; label: string }

/** Formulário de pedido de cadastro. `onCreated` deixa a lista "Meus pedidos" recarregar. */
export function PeripheralRequestForm({
  openCount,
  onCreated,
}: {
  openCount: number
  onCreated: () => void
}) {
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()

  const [category, setCategory] = useState<Category | "">("")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [url, setUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [matches, setMatches] = useState<CatalogMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const shortcutLabel = useSubmitShortcutLabel()

  const atLimit = openCount >= MAX_OPEN_PERIPHERAL_REQUESTS

  // Antes de pedir, mostra o que a wiki já tem com esse nome: a maior parte
  // dos "não achei" é um nome escrito diferente, e pedir o que já existe só
  // enche a fila da equipe. A busca é pelo modelo (a API filtra por nome).
  useEffect(() => {
    const query = model.trim()
    if (query.length < 3) {
      setMatches([])
      setMatchesLoading(false)
      return
    }
    const controller = new AbortController()
    setMatchesLoading(true)
    const timeout = setTimeout(() => {
      fetch(`/api/peripherals?search=${encodeURIComponent(query)}&limit=5`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { peripherals: [] }))
        .then((data: { peripherals?: CatalogMatch[] }) => setMatches(data.peripherals ?? []))
        .catch(() => {})
        .finally(() => setMatchesLoading(false))
    }, 350)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [model])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !category) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/peripheral-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          brandName: brand.trim(),
          modelName: model.trim(),
          referenceUrl: url.trim(),
          notes: notes.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível enviar o pedido.")
        return
      }
      setCreated({
        id: data.requestId,
        number: typeof data.number === "number" ? data.number : null,
        label: `${brand.trim()} ${model.trim()}`,
      })
      onCreated()
    } catch {
      toast.error("Não foi possível enviar o pedido.")
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setCategory("")
    setBrand("")
    setModel("")
    setUrl("")
    setNotes("")
    setMatches([])
    setCreated(null)
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitShortcut(event)) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
        <p className="text-sm text-muted-foreground">Entre na sua conta para pedir o cadastro de um periférico.</p>
        <Button type="button" className="gap-2" onClick={() => openLogin("/perifericos/pedidos")}>
          <LogIn className="size-4" />
          Entrar
        </Button>
      </div>
    )
  }

  if (created) {
    return (
      <div className="flex animate-in fade-in-0 zoom-in-95 flex-col items-center gap-4 rounded-xl border border-border bg-muted/20 px-6 py-12 text-center duration-300">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="size-7 text-emerald-400" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            Pedido {created.number !== null ? `${peripheralRequestNumber(created.number)} ` : ""}enviado!
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            &ldquo;{created.label}&rdquo; entrou na fila. Você recebe uma notificação quando a equipe responder.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href={`/perifericos/pedidos/${created.id}`}>Ver este pedido</Link>
          </Button>
          <Button type="button" variant="outline" onClick={reset} disabled={atLimit}>
            Pedir outro
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Categoria</Label>
            <RequiredBadge />
          </div>
          <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha a categoria" />
            </SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((key) => (
                <SelectItem key={key} value={key}>
                  {CATEGORY_PLURAL_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="pedido-marca">Marca</Label>
            <RequiredBadge />
          </div>
          <Input
            id="pedido-marca"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Ex: Logitech"
            maxLength={PERIPHERAL_REQUEST_LIMITS.brand}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pedido-modelo">Modelo</Label>
          <RequiredBadge />
        </div>
        <div className="relative">
          <Input
            id="pedido-modelo"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Ex: G Pro X Superlight 2"
            minLength={2}
            maxLength={PERIPHERAL_REQUEST_LIMITS.model}
            autoComplete="off"
            required
          />
          {matchesLoading && (
            <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {matches.length > 0 && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 duration-200">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-400">
              <Search className="size-3.5" />
              Já temos algo parecido na wiki. Confira antes de pedir:
            </p>
            <ul className="flex flex-col gap-1">
              {matches.map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/perifericos/${buildPeripheralSlug(match.name, match.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                  >
                    <span className="truncate">{buildPeripheralDisplayName(match.brand, match.name)}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {CATEGORY_PLURAL_LABELS[match.category as Category] ?? match.category}
                      <ExternalLink className="size-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pedido-link">Link do produto</Label>
          <OptionalBadge />
        </div>
        <Input
          id="pedido-link"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Página do fabricante ou de uma loja"
          maxLength={PERIPHERAL_REQUEST_LIMITS.url}
        />
        <p className="text-xs text-muted-foreground">Com o link a equipe acha a ficha técnica bem mais rápido.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pedido-obs">Observações</Label>
          <OptionalBadge />
        </div>
        <Textarea
          id="pedido-obs"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Versão, cor, ano de lançamento, ou qualquer detalhe que ajude a identificar..."
          className="min-h-24"
          maxLength={PERIPHERAL_REQUEST_LIMITS.notes}
        />
      </div>

      {atLimit && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Você já tem {MAX_OPEN_PERIPHERAL_REQUESTS} pedidos em aberto. Aguarde a análise de um deles, ou cancele um, para pedir outro.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" className="gap-2 transition-transform active:scale-[0.98]" disabled={submitting || !category || atLimit}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? "Enviando..." : "Enviar pedido"}
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
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Obrigatório</span>
}

function OptionalBadge() {
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Opcional</span>
}
