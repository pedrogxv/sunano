"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type PayoutRequest = {
  id: string
  amount_cents: number
  status: "requested" | "paid" | "rejected" | "cancelled"
  created_at: string
}

type AffiliateSummary = {
  balanceCents: number
  totalRequestedPendingCents: number
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const STATUS_LABELS: Record<PayoutRequest["status"], string> = {
  requested: "Em análise",
  paid: "Pago",
  rejected: "Recusado",
  cancelled: "Cancelado",
}

export default function SaquesAfiliadoPage() {
  const [payouts, setPayouts] = useState<PayoutRequest[]>([])
  const [summary, setSummary] = useState<AffiliateSummary | null>(null)
  const [pixKey, setPixKey] = useState("")
  const [pixKeyType, setPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cpf")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadData() {
    const [payoutsRes, meRes] = await Promise.all([
      fetch("/api/afiliados/saques").then((r) => r.json()),
      fetch("/api/afiliados/me").then((r) => r.json()),
    ])
    setPayouts(payoutsRes.payouts ?? [])
    setSummary(meRes.summary ?? null)
    if (meRes.affiliate?.pix_key) setPixKey(meRes.affiliate.pix_key)
    if (meRes.affiliate?.pix_key_type) setPixKeyType(meRes.affiliate.pix_key_type)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100)
    if (!amountCents || amountCents <= 0) {
      setError("Informe um valor válido.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/afiliados/saques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, pixKey, pixKeyType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Não foi possível solicitar o saque.")
        return
      }
      setAmount("")
      await loadData()
    } catch {
      setError("Não foi possível solicitar o saque.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const availableCents = summary ? summary.balanceCents - summary.totalRequestedPendingCents : 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">Saques</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Solicitar saque</CardTitle>
        </CardHeader>
        <CardContent>
          {summary && (
            <p className="mb-4 text-sm text-muted-foreground">
              Disponível para saque: <strong>{formatCents(availableCents)}</strong>
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Valor (R$)</label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Chave PIX</label>
              <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} required minLength={3} maxLength={200} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Enviando..." : "Solicitar saque"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Histórico</h2>
      {payouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum saque solicitado ainda.</p>
      ) : (
        <div className="space-y-3">
          {payouts.map((payout) => (
            <Card key={payout.id}>
              <CardContent className="flex items-center justify-between py-2">
                <div>
                  <Badge variant={payout.status === "paid" ? "default" : payout.status === "rejected" ? "destructive" : "secondary"}>
                    {STATUS_LABELS[payout.status]}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(payout.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span>{formatCents(payout.amount_cents)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
