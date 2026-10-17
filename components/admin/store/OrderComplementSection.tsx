"use client"

import { useEffect, useState } from "react"
import { Clock, Coins, Link2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { ORDER_PAID_STATUSES, type OrderStatusValue } from "@/lib/order-status"
import {
  COMPLEMENT_MIN_CENTS,
  COMPLEMENT_NOTE_MAX,
  type OrderComplementSummary,
} from "@/lib/store-payment-complement"

/** "1.250,00", "1250,00" ou "1250.00" → centavos. NaN quando não é número. */
function parseBrl(value: string): number {
  const trimmed = value.trim()
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed
  return Math.round(Number(normalized) * 100)
}

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",")
}

/**
 * Complemento de Pagamento no pedido (ver lib/store-payment-complement.ts).
 *
 * No pedido comum: o admin grava quanto o cliente ainda deve (o orçamento do
 * Xianyu/Expert Buy, a diferença de outro pedido) e acompanha o que já entrou.
 * No pedido que É um complemento: só diz de qual pedido ele é.
 */
export function OrderComplementSection({
  orderId,
  status,
  complement,
  complementFor,
  onSaved,
}: {
  orderId: string
  status: OrderStatusValue
  complement: OrderComplementSummary
  complementFor: { order_id: string; order_number: string } | null
  onSaved: (summary: OrderComplementSummary) => void
}) {
  const [due, setDue] = useState(centsToInput(complement.dueCents))
  const [note, setNote] = useState(complement.note ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDue(centsToInput(complement.dueCents))
    setNote(complement.note ?? "")
  }, [orderId, complement.dueCents, complement.note])

  if (complementFor) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 text-xs text-violet-200">
        <Link2 className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Pagamento de <span className="font-semibold">Complemento</span> do pedido{" "}
          <span className="font-mono font-semibold">#{complementFor.order_number}</span>. O valor abate o pendente
          daquele pedido; estornar este pagamento devolve o valor ao pendente.
        </p>
      </div>
    )
  }

  if (!ORDER_PAID_STATUSES.includes(status)) return null

  async function save(nextDueCents: number | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/store/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_complement", dueCents: nextDueCents, note: note.trim() || null }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; complement?: OrderComplementSummary }
      if (!res.ok || !data.complement) throw new Error(data.error ?? "Erro ao salvar o complemento")
      onSaved(data.complement)
      toast.success(nextDueCents === null ? "Complemento removido" : "Complemento salvo", {
        description:
          data.complement.pendingCents > 0
            ? `Falta ${formatBRL(data.complement.pendingCents)} no pedido #${orderNumber(orderId)}.`
            : `#${orderNumber(orderId)}`,
      })
    } catch (err) {
      toast.error("Erro ao salvar o complemento", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      })
    } finally {
      setSaving(false)
    }
  }

  function handleSave() {
    if (!due.trim()) {
      void save(null)
      return
    }
    const cents = parseBrl(due)
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Valor inválido", { description: "Use o formato 1250,00." })
      return
    }
    void save(cents)
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Coins className="size-3.5" />
        Complemento de pagamento
      </p>

      {complement.dueCents !== null && (
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Cobrado</dt>
            <dd className="font-semibold text-foreground">{formatBRL(complement.dueCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pago</dt>
            <dd className="font-semibold text-emerald-400">{formatBRL(complement.paidCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Falta</dt>
            <dd className={complement.pendingCents > 0 ? "font-semibold text-amber-400" : "font-semibold text-foreground"}>
              {formatBRL(complement.pendingCents)}
            </dd>
          </div>
        </dl>
      )}

      {complement.awaitingPaymentOrderId && (
        <p className="flex items-center gap-1.5 text-xs text-amber-400">
          <Clock className="size-3.5 shrink-0" />
          Pagamento gerado e aguardando: pedido #{orderNumber(complement.awaitingPaymentOrderId)}. O valor só muda depois
          que ele for pago, expirar ou for cancelado.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="space-y-1">
          <Label htmlFor={`complement-due-${orderId}`} className="text-xs">
            Total cobrado (R$)
          </Label>
          <Input
            id={`complement-due-${orderId}`}
            value={due}
            onChange={(e) => setDue(e.target.value)}
            placeholder="Ex: 1250,00"
            inputMode="decimal"
            disabled={saving || Boolean(complement.awaitingPaymentOrderId)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`complement-note-${orderId}`} className="text-xs">
            Observação para o cliente (opcional)
          </Label>
          <Textarea
            id={`complement-note-${orderId}`}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, COMPLEMENT_NOTE_MAX))}
            placeholder="Ex: Wooting 80HE seminovo + frete até o Brasil"
            rows={2}
            disabled={saving}
            className="text-sm"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/80">
        É o total que o cliente ainda paga além deste pedido; num segundo orçamento, some ao anterior. Mínimo de{" "}
        {formatBRL(COMPLEMENT_MIN_CENTS)} pendentes. O cliente paga no anúncio &quot;Complemento de Pagamento&quot; com o
        número #{orderNumber(orderId)}, e o passo a passo aparece no pedido dele. Com conversa de serviço aberta, a
        equipe avisa nela.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {complement.dueCents !== null && complement.paidCents === 0 && !complement.awaitingPaymentOrderId && (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void save(null)}>
            Remover cobrança
          </Button>
        )}
        <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? "Salvando..." : "Salvar complemento"}
        </Button>
      </div>
    </div>
  )
}
