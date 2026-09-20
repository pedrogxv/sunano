"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRight, ExternalLink, Loader2, LogIn } from "lucide-react"

import { PeripheralRequestStatusBadge } from "@/components/peripherals/requests/PeripheralRequestStatusBadge"
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
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import {
  PERIPHERAL_REQUEST_STATUS_HINT,
  isPeripheralRequestOpen,
  peripheralRequestNumber,
} from "@/lib/peripheral-requests"
import { CATEGORY_PLURAL_LABELS } from "@/lib/tag-options"
import type { PeripheralRequestDetail } from "@/lib/server/repositories/peripheral-requests-repository"

type LoadState = "loading" | "ready" | "not-found" | "error"

/** Detalhe do pedido para quem o abriu (/perifericos/pedidos/[id]). */
export function PeripheralRequestDetailView({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const [request, setRequest] = useState<PeripheralRequestDetail | null>(null)
  const [state, setState] = useState<LoadState>("loading")
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/peripheral-requests/${id}`)
      if (res.status === 404) {
        setState("not-found")
        return
      }
      if (!res.ok) {
        setState("error")
        return
      }
      const data = (await res.json()) as { request: PeripheralRequestDetail }
      setRequest(data.request)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [id])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user, load])

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/peripheral-requests/${id}/cancel`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível cancelar o pedido.")
        // O pedido pode ter mudado de status enquanto a tela estava aberta.
        await load()
        return
      }
      toast.success("Pedido cancelado.")
      await load()
    } catch {
      toast.error("Não foi possível cancelar o pedido.")
    } finally {
      setCancelling(false)
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
        <p className="text-sm text-muted-foreground">Entre na sua conta para ver este pedido.</p>
        <Button type="button" className="gap-2" onClick={() => openLogin(`/perifericos/pedidos/${id}`)}>
          <LogIn className="size-4" />
          Entrar
        </Button>
      </div>
    )
  }

  if (authLoading || state === "loading") {
    return (
      <div className="flex justify-center py-16">
        <BoxLoader />
      </div>
    )
  }

  if (state === "not-found" || state === "error" || !request) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {state === "error" ? "Não foi possível carregar o pedido." : "Pedido não encontrado."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/perifericos/pedidos">Voltar aos meus pedidos</Link>
        </Button>
      </div>
    )
  }

  const open = isPeripheralRequestOpen(request.status)

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeripheralRequestStatusBadge status={request.status} />
          <span className="text-xs tabular-nums text-muted-foreground">{peripheralRequestNumber(request.number)}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {request.brand_name} {request.model_name}
        </h1>
        <p className="text-sm text-muted-foreground">{PERIPHERAL_REQUEST_STATUS_HINT[request.status]}</p>
      </div>

      {request.peripheral && (
        <Link
          href={request.peripheral.href}
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 transition-colors hover:bg-emerald-500/10"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-400">Ficha na wiki</p>
            <p className="truncate text-sm font-semibold text-foreground">{request.peripheral.displayName}</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-emerald-400" />
        </Link>
      )}

      {request.staff_response && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resposta da equipe</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{request.staff_response}</p>
        </div>
      )}

      <dl className="divide-y divide-border rounded-xl border border-border text-sm">
        <Row label="Categoria">{CATEGORY_PLURAL_LABELS[request.category]}</Row>
        <Row label="Marca">{request.brand_name}</Row>
        <Row label="Modelo">{request.model_name}</Row>
        {request.reference_url && (
          <Row label="Link">
            <a
              href={request.reference_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex max-w-full items-center gap-1.5 text-primary hover:underline"
            >
              <span className="truncate">{request.reference_url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </Row>
        )}
        {request.notes && (
          <Row label="Observações">
            <span className="whitespace-pre-wrap">{request.notes}</span>
          </Row>
        )}
        <Row label="Enviado em">{format(new Date(request.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</Row>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/perifericos/pedidos">Meus pedidos</Link>
        </Button>

        {open && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={cancelling}>
                {cancelling && <Loader2 className="size-3.5 animate-spin" />}
                Cancelar pedido
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
                <AlertDialogDescription>
                  A equipe deixa de analisar &ldquo;{request.brand_name} {request.model_name}&rdquo;. Você pode pedir de novo depois.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleCancel()}>Cancelar pedido</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  )
}
