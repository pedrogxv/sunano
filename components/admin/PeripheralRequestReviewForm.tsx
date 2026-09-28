"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ExternalLink, Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AuraAmount } from "@/components/ui/AuraIcon"
import {
  PERIPHERAL_REQUEST_AURA_REWARD,
  PERIPHERAL_REQUEST_LIMITS,
  PERIPHERAL_REQUEST_REPLY_PRESETS,
  PERIPHERAL_REQUEST_STATUS_LABEL,
  type PeripheralRequestStatus,
} from "@/lib/peripheral-requests"
import { cn } from "@/lib/utils"
import { buildPeripheralDisplayName } from "@/lib/peripheral-slug"
import type { LinkedPeripheral } from "@/lib/server/repositories/peripheral-requests-repository"

type ReviewStatus = Exclude<PeripheralRequestStatus, "cancelled">

const REVIEW_OPTIONS: ReviewStatus[] = ["pending", "in_review", "added", "duplicate", "rejected"]

const NEEDS_PERIPHERAL: readonly ReviewStatus[] = ["added", "duplicate"]

type CatalogMatch = { id: string; name: string; brand: string }

const ALL_PRESETS = new Set(Object.values(PERIPHERAL_REQUEST_REPLY_PRESETS).flat())

/** Resposta que ninguém escreveu à mão: vazia ou uma das prontas. Só essa o status pode trocar sozinho. */
function isAutoFillable(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length === 0 || ALL_PRESETS.has(trimmed)
}

/** Formulário de revisão do pedido: status, resposta à pessoa e a ficha resultante. */
export function PeripheralRequestReviewForm({
  requestId,
  initialStatus,
  initialResponse,
  initialPeripheral,
  modelName,
  auraRewarded,
}: {
  requestId: string
  initialStatus: ReviewStatus
  initialResponse: string | null
  initialPeripheral: LinkedPeripheral | null
  /** Modelo pedido: já entra na busca da ficha, que é também a checagem de duplicidade. */
  modelName: string
  /** Aura já paga por este pedido (`null` = nada ainda): o aviso de recompensa só aparece antes de pagar. */
  auraRewarded: number | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<ReviewStatus>(initialStatus)
  const [response, setResponse] = useState(initialResponse ?? "")
  const presets = PERIPHERAL_REQUEST_REPLY_PRESETS[status] ?? []
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(
    initialPeripheral ? { id: initialPeripheral.id, label: initialPeripheral.displayName } : null
  )
  const [query, setQuery] = useState(modelName)
  const [matches, setMatches] = useState<CatalogMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const needsPeripheral = NEEDS_PERIPHERAL.includes(status)
  const showPicker = needsPeripheral && !selected

  useEffect(() => {
    if (!showPicker) return
    const term = query.trim()
    if (term.length < 2) {
      setMatches([])
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timeout = setTimeout(() => {
      fetch(`/api/peripherals?search=${encodeURIComponent(term)}&limit=8`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { peripherals: [] }))
        .then((data: { peripherals?: CatalogMatch[] }) => setMatches(data.peripherals ?? []))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query, showPicker])

  function handleStatusChange(next: ReviewStatus) {
    setStatus(next)
    // Frase pronta do novo status, para bastar escolher o status e salvar.
    // Texto escrito à mão nunca é sobrescrito.
    if (isAutoFillable(response)) {
      setResponse(PERIPHERAL_REQUEST_REPLY_PRESETS[next]?.[0] ?? "")
    }
  }

  const missingPeripheral = needsPeripheral && !selected
  const missingReason = status === "rejected" && response.trim().length === 0

  async function handleSave() {
    if (saving || missingPeripheral || missingReason) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/peripheral-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          response: response.trim() || null,
          peripheralId: needsPeripheral ? selected?.id ?? null : null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível salvar.")
        return
      }
      toast.success("Pedido atualizado.")
      router.refresh()
    } catch {
      toast.error("Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={(value) => handleStatusChange(value as ReviewStatus)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEW_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {PERIPHERAL_REQUEST_STATUS_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {status === "added" && auraRewarded === null && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Ao salvar, quem pediu ganha{" "}
            <AuraAmount value={PERIPHERAL_REQUEST_AURA_REWARD} prefix="+" size="sm" tone="brand" className="font-medium text-foreground" />
          </p>
        )}
      </div>

      {needsPeripheral && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pedido-ficha">Ficha na wiki</Label>
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="truncate text-sm font-medium text-foreground">{selected.label}</span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Trocar ficha"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pedido-ficha"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar periférico pelo nome..."
                  className="pl-8 pr-8"
                  autoComplete="off"
                />
                {searching && (
                  <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {matches.length > 0 && (
                <ul className="max-h-64 overflow-y-auto rounded-lg border border-border bg-popover">
                  {matches.map((match) => (
                    <li key={match.id} className="border-b border-border/60 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setSelected({ id: match.id, label: buildPeripheralDisplayName(match.brand, match.name) })}
                        className="w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                      >
                        {buildPeripheralDisplayName(match.brand, match.name)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {status === "added" && (
                <p className="text-xs text-muted-foreground">
                  Ainda não cadastrou?{" "}
                  <Link
                    href="/admin/perifericos/new"
                    target="_blank"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Abrir o formulário de novo periférico
                    <ExternalLink className="size-3" />
                  </Link>
                  , depois volte e escolha a ficha aqui.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pedido-resposta">Resposta para quem pediu</Label>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {status === "rejected" ? "Obrigatória" : "Opcional"}
          </span>
        </div>
        <Textarea
          id="pedido-resposta"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={
            status === "rejected"
              ? "Explique o motivo. A pessoa lê isto."
              : "Um recado curto, se quiser. A pessoa lê isto."
          }
          className="min-h-24"
          maxLength={PERIPHERAL_REQUEST_LIMITS.response}
        />
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setResponse(preset)}
                title={preset}
                className={cn(
                  "max-w-full truncate rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
                  response.trim() === preset
                    ? "border-foreground/40 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void handleSave()} disabled={saving || missingPeripheral || missingReason} className="gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}
