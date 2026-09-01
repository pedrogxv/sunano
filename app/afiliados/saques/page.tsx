"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  Clock,
  Loader2,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { MAX_PENDING_PAYOUTS, MIN_PAYOUT_CENTS } from "@/lib/affiliate-payout"
import { formatBRL } from "@/lib/format"
import {
  PIX_KEY_PLACEHOLDERS,
  PIX_KEY_TYPES,
  PIX_KEY_TYPE_LABELS,
  type PixKeyType,
  formatPixKeyInput,
  maskPixKey,
  validatePixKey,
} from "@/lib/pix-key"
import { cn } from "@/lib/utils"

type PayoutRequest = {
  id: string
  amount_cents: number
  status: "requested" | "paid" | "rejected" | "cancelled"
  pix_key: string
  pix_key_type: PixKeyType
  admin_note: string | null
  created_at: string
  paid_at: string | null
}

type AffiliateSummary = {
  balanceCents: number
  totalRequestedPendingCents: number
  availableCents: number
}

const STATUS_META: Record<
  PayoutRequest["status"],
  { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline"; hint: string }
> = {
  requested: {
    label: "Em análise",
    icon: Clock,
    variant: "secondary",
    hint: "Costuma cair em até 2 dias úteis — você é notificado quando sair.",
  },
  paid: { label: "Pago", icon: Check, variant: "default", hint: "Valor enviado para sua chave PIX." },
  rejected: { label: "Recusado", icon: X, variant: "destructive", hint: "O valor voltou para o seu saldo." },
  cancelled: { label: "Cancelado", icon: Ban, variant: "outline", hint: "Você cancelou este saque." },
}

/**
 * Centavos a partir do que a pessoa digitou no campo mascarado. O input é
 * tratado como caixa registradora (dígitos entram pela direita), então o
 * valor nunca fica ambíguo entre "1.500" reais e "1,500".
 */
function digitsToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "").slice(0, 9)
  return digits ? Number(digits) : 0
}

function centsToInput(cents: number): string {
  if (!cents) return ""
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SaquesAfiliadoPage() {
  const [payouts, setPayouts] = useState<PayoutRequest[]>([])
  const [summary, setSummary] = useState<AffiliateSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [pixKey, setPixKey] = useState("")
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("cpf")
  const [amountInput, setAmountInput] = useState("")
  const [touched, setTouched] = useState<{ amount: boolean; pix: boolean }>({ amount: false, pix: false })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<PayoutRequest | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [payoutsRes, meRes] = await Promise.all([
        fetch("/api/afiliados/saques").then((r) => r.json()),
        fetch("/api/afiliados/me").then((r) => r.json()),
      ])
      setPayouts(payoutsRes.payouts ?? [])
      setSummary(meRes.summary ?? null)
      if (meRes.affiliate?.pix_key_type) setPixKeyType(meRes.affiliate.pix_key_type)
      if (meRes.affiliate?.pix_key) {
        setPixKey(formatPixKeyInput(meRes.affiliate.pix_key_type ?? "cpf", meRes.affiliate.pix_key))
      }
    } catch {
      toast.error("Não foi possível carregar seus saques.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const availableCents = summary?.availableCents ?? 0
  const pendingCount = payouts.filter((p) => p.status === "requested").length
  const amountCents = digitsToCents(amountInput)
  const remainingCents = availableCents - amountCents

  // Uma razão de bloqueio por vez, na ordem em que a pessoa esbarra nelas.
  const amountError = useMemo(() => {
    if (!amountCents) return null
    if (amountCents < MIN_PAYOUT_CENTS) return `O saque mínimo é de ${formatBRL(MIN_PAYOUT_CENTS)}.`
    if (amountCents > availableCents)
      return `Você tem ${formatBRL(availableCents)} disponíveis — faltam ${formatBRL(amountCents - availableCents)}.`
    return null
  }, [amountCents, availableCents])

  const pixError = touched.pix || pixKey ? validatePixKey(pixKeyType, pixKey) : null

  const blockedReason = useMemo(() => {
    if (pendingCount >= MAX_PENDING_PAYOUTS)
      return `Você já tem ${MAX_PENDING_PAYOUTS} saques em análise. Aguarde um deles ser processado para pedir outro.`
    if (availableCents < MIN_PAYOUT_CENTS)
      return `Você precisa de pelo menos ${formatBRL(MIN_PAYOUT_CENTS)} disponíveis para sacar. Faltam ${formatBRL(
        MIN_PAYOUT_CENTS - availableCents
      )}.`
    return null
  }, [pendingCount, availableCents])

  const canSubmit =
    !blockedReason && amountCents >= MIN_PAYOUT_CENTS && amountCents <= availableCents && !pixError && !!pixKey.trim()

  // Atalhos: metade, e o saldo inteiro. Só aparecem quando resultam num valor
  // que de fato passa no mínimo — botão que erra sozinho é pior que botão nenhum.
  const shortcuts = useMemo(() => {
    const half = Math.floor(availableCents / 2)
    return [
      { label: "Metade", cents: half },
      { label: "Tudo", cents: availableCents },
    ].filter((s) => s.cents >= MIN_PAYOUT_CENTS)
  }, [availableCents])

  function handleAmountChange(value: string) {
    setAmountInput(centsToInput(digitsToCents(value)))
  }

  function handlePixTypeChange(type: PixKeyType) {
    setPixKeyType(type)
    // A chave antiga não faz sentido no novo tipo (um CPF digitado não vira
    // e-mail); limpar evita mandar lixo herdado da seleção anterior.
    setPixKey("")
    setTouched((t) => ({ ...t, pix: false }))
  }

  function handleReview(event: React.FormEvent) {
    event.preventDefault()
    setTouched({ amount: true, pix: true })
    if (!canSubmit) return
    setConfirmOpen(true)
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/afiliados/saques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, pixKey, pixKeyType }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível solicitar o saque.")
        // O saldo pode ter mudado por baixo (comissão estornada, outro saque):
        // recarrega para a tela voltar a bater com o servidor.
        await loadData()
        return
      }
      setConfirmOpen(false)
      setAmountInput("")
      setTouched({ amount: false, pix: false })
      toast.success(`Saque de ${formatBRL(amountCents)} solicitado!`, {
        description: "Você recebe um aviso assim que ele for processado.",
      })
      await loadData()
    } catch {
      toast.error("Não foi possível solicitar o saque.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return
    setIsCancelling(true)
    try {
      const res = await fetch("/api/afiliados/saques", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId: cancelTarget.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível cancelar o saque.")
        return
      }
      toast.success("Saque cancelado. O valor voltou para o seu saldo disponível.")
      setCancelTarget(null)
      await loadData()
    } catch {
      toast.error("Não foi possível cancelar o saque.")
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
        <Link href="/afiliados">
          <ArrowLeft className="size-4" /> Painel do afiliado
        </Link>
      </Button>

      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">Saques</h1>

      {/* Saldo em destaque: é a informação que decide tudo o que vem abaixo. */}
      <Card className="mb-6 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 border-b bg-muted/40 p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Disponível para saque</p>
              {loading ? (
                <Skeleton className="mt-1 h-8 w-32" />
              ) : (
                <p className="font-display text-3xl font-bold tabular-nums">{formatBRL(availableCents)}</p>
              )}
            </div>
          </div>
          {!loading && summary && summary.totalRequestedPendingCents > 0 && (
            <p className="px-5 py-3 text-xs text-muted-foreground">
              <Clock className="mr-1 inline size-3 align-[-2px]" />
              {formatBRL(summary.totalRequestedPendingCents)} já reservados em {pendingCount}{" "}
              {pendingCount === 1 ? "saque em análise" : "saques em análise"} — por isso não entram no valor acima.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Solicitar saque</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : blockedReason ? (
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>{blockedReason}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleReview} className="space-y-5">
              <div>
                <label htmlFor="payout-amount" className="mb-1.5 block text-sm font-medium">
                  Quanto você quer sacar?
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id="payout-amount"
                    value={amountInput}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                    placeholder="0,00"
                    inputMode="numeric"
                    aria-invalid={!!amountError}
                    aria-describedby="payout-amount-hint"
                    className={cn("pl-9 text-lg tabular-nums", amountError && "border-destructive")}
                  />
                </div>

                {shortcuts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shortcuts.map((shortcut) => (
                      <Button
                        key={shortcut.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAmountInput(centsToInput(shortcut.cents))}
                      >
                        {shortcut.label} · {formatBRL(shortcut.cents)}
                      </Button>
                    ))}
                  </div>
                )}

                {/* A linha abaixo do campo muda enquanto a pessoa digita: ou o
                    erro, ou quanto sobra — o feedback que faltava por completo. */}
                <p
                  id="payout-amount-hint"
                  className={cn(
                    "mt-2 text-xs",
                    amountError ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {amountError ??
                    (amountCents > 0
                      ? `Restam ${formatBRL(remainingCents)} no seu saldo depois deste saque.`
                      : `Mínimo de ${formatBRL(MIN_PAYOUT_CENTS)}.`)}
                </p>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium">Tipo de chave PIX</span>
                <div className="flex flex-wrap gap-2">
                  {PIX_KEY_TYPES.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={pixKeyType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePixTypeChange(type)}
                    >
                      {PIX_KEY_TYPE_LABELS[type]}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="payout-pix" className="mb-1.5 block text-sm font-medium">
                  Sua chave PIX
                </label>
                <Input
                  id="payout-pix"
                  value={pixKey}
                  onChange={(e) => setPixKey(formatPixKeyInput(pixKeyType, e.target.value))}
                  onBlur={() => setTouched((t) => ({ ...t, pix: true }))}
                  placeholder={PIX_KEY_PLACEHOLDERS[pixKeyType]}
                  inputMode={pixKeyType === "cpf" || pixKeyType === "cnpj" || pixKeyType === "phone" ? "numeric" : "text"}
                  maxLength={200}
                  aria-invalid={!!pixError}
                  aria-describedby="payout-pix-hint"
                  className={cn(pixError && "border-destructive")}
                />
                <p
                  id="payout-pix-hint"
                  className={cn("mt-2 text-xs", pixError ? "font-medium text-destructive" : "text-muted-foreground")}
                >
                  {pixError ?? "Confira com atenção: o PIX é enviado exatamente para esta chave."}
                </p>
              </div>

              <Button type="submit" disabled={!canSubmit} className="w-full">
                {amountCents >= MIN_PAYOUT_CENTS && !amountError
                  ? `Revisar saque de ${formatBRL(amountCents)}`
                  : "Revisar saque"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Histórico</h2>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : payouts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Wallet className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhum saque solicitado ainda. Suas comissões confirmadas aparecem no saldo acima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payouts.map((payout) => {
            const meta = STATUS_META[payout.status]
            const StatusIcon = meta.icon
            return (
              <Card key={payout.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-display text-lg font-semibold tabular-nums">
                        {formatBRL(payout.amount_cents)}
                      </span>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {PIX_KEY_TYPE_LABELS[payout.pix_key_type]} ·{" "}
                        {maskPixKey(payout.pix_key_type, payout.pix_key)}
                      </p>
                    </div>
                    <Badge variant={meta.variant} className="shrink-0 gap-1">
                      <StatusIcon className="size-3" />
                      {meta.label}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Solicitado em {new Date(payout.created_at).toLocaleString("pt-BR")}
                    {payout.paid_at && ` · Pago em ${new Date(payout.paid_at).toLocaleString("pt-BR")}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{meta.hint}</p>

                  {payout.admin_note && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs">
                      <strong>Observação:</strong> {payout.admin_note}
                    </p>
                  )}

                  {payout.status === "requested" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 text-muted-foreground hover:text-destructive"
                      onClick={() => setCancelTarget(payout)}
                    >
                      <Ban className="size-3.5" /> Cancelar saque
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Confirmação com o valor e a chave por extenso: última chance de pegar
          um dígito errado antes de o dinheiro sair. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar saque</DialogTitle>
            <DialogDescription>Confira os dados — o PIX é enviado exatamente para esta chave.</DialogDescription>
          </DialogHeader>

          <dl className="space-y-3 rounded-lg border p-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-display text-xl font-bold tabular-nums">{formatBRL(amountCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{PIX_KEY_TYPE_LABELS[pixKeyType]}</dt>
              <dd className="break-all text-right font-medium">{pixKey}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t pt-3">
              <dt className="text-muted-foreground">Saldo depois</dt>
              <dd className="tabular-nums">{formatBRL(remainingCents)}</dd>
            </div>
          </dl>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Voltar e editar
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? "Enviando..." : "Confirmar saque"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar saque</DialogTitle>
            <DialogDescription>
              {cancelTarget &&
                `Os ${formatBRL(cancelTarget.amount_cents)} voltam para o seu saldo disponível e você pode pedir de novo quando quiser.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={isCancelling}>
              Manter saque
            </Button>
            <Button type="button" variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling && <Loader2 className="size-4 animate-spin" />}
              {isCancelling ? "Cancelando..." : "Cancelar saque"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
