"use client"

import { Check, MapPin, PackageCheck, Pencil, Truck, X } from "lucide-react"
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
 * O preenchimento é SEMPRE opcional: pedir CEP antes de pagar é o que mais
 * derruba conversão, e o dado só é necessário na hora de despachar. Quem
 * escolher "Informar depois" fecha o pedido normalmente e completa em "Meus
 * Pedidos" — o card deixa isso explícito em vez de dar a entender que a
 * compra está incompleta.
 *
 * O card só é montado quando o carrinho tem item físico (`requires_shipping`
 * dos produtos, decidido no servidor) — um carrinho só de serviços não vê
 * nada disso.
 */
export function CheckoutShippingCard({
  form,
  onChange,
  editing,
  onEditingChange,
  skipped,
  onSkippedChange,
}: {
  form: ShippingForm
  onChange: (next: ShippingForm) => void
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
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(pode ficar para depois)</span>
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
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              <PackageCheck className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-amber-300">
                  Este pedido tem item físico e precisa de endereço para ser enviado.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Não trava a compra: informe agora ou logo depois de pagar, em “Meus Pedidos”.
                  Só não despachamos enquanto o endereço estiver faltando.
                </p>
              </div>
            </div>
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
            <Button type="button" size="sm" variant="ghost" onClick={skip} className="text-xs text-muted-foreground">
              Informar depois de pagar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
