"use client"

import { useEffect, useState } from "react"
import { Loader2, Truck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  EMPTY_SHIPPING_FORM,
  ShippingAddressFields,
  isShippingFormComplete,
  isoToBirthDateInput,
  shippingFormToPayload,
  toShippingResidenceType,
  type ShippingForm,
} from "@/components/store/ShippingAddressFields"
import { formatCepInput, formatCpfInput, formatPhoneInput } from "@/components/store/CheckoutPayerCard"

export type ExistingShippingAddress = {
  recipient: string
  /** CPF, nascimento ("AAAA-MM-DD") e tipo de residência: nulos em pedido anterior a cada campo. */
  cpf: string | null
  birth_date: string | null
  residence_type: string | null
  phone: string
  postal_code: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
} | null

/**
 * Informa (ou corrige) o endereço de entrega depois que o pedido já existe —
 * o caminho de quem escolheu "informar depois" no checkout, e a única forma
 * de corrigir um endereço errado antes do despacho.
 *
 * Escreve em `PUT /api/store/orders/{id}/shipping-address`, que valida tudo
 * de novo no servidor e confere a posse do pedido no próprio UPDATE.
 */
export function OrderShippingAddressDialog({
  orderId,
  existing,
  open,
  onOpenChange,
  onSaved,
}: {
  orderId: string | null
  existing: ExistingShippingAddress
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ShippingForm>(EMPTY_SHIPPING_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Recarrega o formulário toda vez que o dialog abre para um pedido: sem
  // isso, abrir o pedido B depois do A mostraria o endereço do A.
  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(
      existing
        ? {
            recipient: existing.recipient,
            postalCode: formatCepInput(existing.postal_code),
            residenceType: toShippingResidenceType(existing.residence_type),
            street: existing.street,
            number: existing.number,
            complement: existing.complement ?? "",
            neighborhood: existing.neighborhood,
            city: existing.city,
            state: existing.state,
            cpf: formatCpfInput(existing.cpf ?? ""),
            phone: formatPhoneInput(existing.phone),
            birthDate: isoToBirthDateInput(existing.birth_date),
          }
        : EMPTY_SHIPPING_FORM
    )
  }, [open, orderId, existing])

  async function handleSave() {
    if (!orderId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/store/orders/${orderId}/shipping-address`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shippingFormToPayload(form)),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar o endereço.")

      toast.success("Endereço de entrega salvo.")
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o endereço.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-4 text-emerald-400" />
            {existing ? "Alterar endereço de entrega" : "Informar endereço de entrega"}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? "Só é possível alterar enquanto o pedido não foi despachado."
              : "Seu pedido só é despachado depois que este endereço for informado."}
          </DialogDescription>
        </DialogHeader>

        <ShippingAddressFields form={form} onChange={setForm} disabled={saving} />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !isShippingFormComplete(form)}
            className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500 sm:w-auto"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar endereço
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
