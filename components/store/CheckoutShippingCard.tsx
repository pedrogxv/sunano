"use client"

import { Check, MapPin, Pencil, Truck, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import {
  ShippingAddressFields,
  formatShippingAddressLine,
  isShippingFormComplete,
  type ShippingForm,
} from "@/components/store/ShippingAddressFields"

/**
 * Card de "endereço de entrega" do checkout — separado do card de dados da
 * cobrança (`CheckoutPayerCard`) de propósito: cobrança é o que a Asaas
 * exige do pagador no cartão, entrega é para onde o pacote vai. Podem ser
 * endereços diferentes, e misturar os dois num card só faria o cliente
 * corrigir um achando que está corrigindo o outro.
 *
 * Enquanto o preenchimento é opcional (`required` false), o card oferece
 * "Informar depois" — o pedido é criado sem endereço e a pessoa completa em
 * "Meus Pedidos" após o pagamento.
 */
export function CheckoutShippingCard({
  form,
  onChange,
  required,
  editing,
  onEditingChange,
  skipped,
  onSkippedChange,
}: {
  form: ShippingForm
  onChange: (next: ShippingForm) => void
  /** SHIPPING_ADDRESS_REQUIRED no servidor — some o botão "Informar depois". */
  required: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  skipped: boolean
  onSkippedChange: (skipped: boolean) => void
}) {
  const [snapshot, setSnapshot] = useState<ShippingForm | null>(null)
  const complete = isShippingFormComplete(form)

  function startEditing() {
    setSnapshot(form)
    onSkippedChange(false)
    onEditingChange(true)
  }

  function confirmEditing() {
    setSnapshot(null)
    onEditingChange(false)
  }

  function cancelEditing() {
    if (snapshot) onChange(snapshot)
    setSnapshot(null)
    onEditingChange(false)
  }

  function skip() {
    setSnapshot(null)
    onSkippedChange(true)
    onEditingChange(false)
  }

  return (
    <div className={cn("rounded-xl border", CARD_SURFACE)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-foreground">
            Endereço de entrega
            {!required && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(opcional)</span>}
          </h2>
        </div>
        {!editing && (
          <Button type="button" size="sm" variant="outline" onClick={startEditing} className="h-7 gap-1.5 text-xs">
            <Pencil className="size-3" />
            {complete && !skipped ? "Editar" : "Informar"}
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-2 px-4 py-3">
          {complete && !skipped ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {form.recipient}
                  </p>
                  <p className="text-xs text-foreground">
                    {formatShippingAddressLine({
                      street: form.street,
                      number: form.number,
                      complement: form.complement,
                      neighborhood: form.neighborhood,
                      city: form.city,
                      state: form.state,
                      postal_code: form.postalCode,
                    })}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                É para cá que o pedido vai. O endereço fica registrado neste pedido, mesmo que você mude o do seu perfil depois.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {required
                ? "Informe para onde devemos enviar o pedido."
                : "Você pode informar agora ou depois do pagamento, em “Meus Pedidos”. Enquanto não informar, o pedido não é despachado."}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <ShippingAddressFields form={form} onChange={onChange} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={confirmEditing}
              disabled={!complete}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Check className="size-3.5" />
              Confirmar endereço
            </Button>
            {complete && (
              <Button type="button" size="sm" variant="ghost" onClick={cancelEditing} className="gap-1.5 text-muted-foreground">
                <X className="size-3.5" />
                Cancelar
              </Button>
            )}
            {!required && (
              <Button type="button" size="sm" variant="ghost" onClick={skip} className="text-xs text-muted-foreground">
                Informar depois
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
