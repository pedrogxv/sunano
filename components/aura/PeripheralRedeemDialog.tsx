"use client"

import { useState } from "react"
import { Crown, Loader2, Package, Sparkles, Truck } from "lucide-react"

import { auraPriceForVip } from "@/lib/aura-pricing"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  EMPTY_SHIPPING_FORM,
  ShippingAddressFields,
  isShippingFormComplete,
  type ShippingForm,
} from "@/components/store/ShippingAddressFields"
import { formatCepInput, formatPhoneInput } from "@/components/store/CheckoutPayerCard"

const AURA_ICON = "🔥"

export type PrefillShipping = {
  recipient: string | null
  phone: string | null
  postalCode: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
} | null

/** Prefill → estado inicial do formulário. Fora do componente porque é usado no lazy init do useState. */
function prefillToForm(prefill: PrefillShipping): ShippingForm {
  if (!prefill || !prefill.postalCode) return EMPTY_SHIPPING_FORM
  return {
    recipient: prefill.recipient ?? "",
    phone: formatPhoneInput(prefill.phone ?? ""),
    postalCode: formatCepInput(prefill.postalCode ?? ""),
    street: prefill.street ?? "",
    number: prefill.number ?? "",
    complement: prefill.complement ?? "",
    neighborhood: prefill.neighborhood ?? "",
    city: prefill.city ?? "",
    state: prefill.state ?? "",
  }
}

interface PeripheralRedeemDialogProps {
  onOpenChange: (open: boolean) => void
  itemName: string
  /** Preço de tabela em Aura, valor cheio. */
  listPrice: number
  isVip: boolean
  balance: number
  loading: boolean
  /** Último endereço de entrega conhecido do usuário, para pré-preencher. */
  prefill: PrefillShipping
  onConfirm: (form: ShippingForm) => void
}

/**
 * Resgate de produto FÍSICO na Central de Aura. Diferente dos cosméticos, aqui
 * o resgate já é o pedido: pede o endereço de entrega junto (não há checkout
 * depois) e o custo sai em Aura. O visual deixa claro que é "pago com Aura".
 *
 * Montado só enquanto aberto (o card controla isso), então o `useState` com
 * lazy init de `prefill` já reidrata a cada abertura — sem efeito de sync.
 */
export function PeripheralRedeemDialog({
  onOpenChange,
  itemName,
  listPrice,
  isVip,
  balance,
  loading,
  prefill,
  onConfirm,
}: PeripheralRedeemDialogProps) {
  const [form, setForm] = useState<ShippingForm>(() => prefillToForm(prefill))

  const price = auraPriceForVip(listPrice, isVip)
  const remaining = balance - price.finalPrice

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-4 text-amber-400" />
            Resgatar {itemName}
          </DialogTitle>
          <DialogDescription>
            Produto físico pago com Aura. Ele vira um pedido igual aos da loja; você
            acompanha o envio em <span className="font-medium text-foreground">Meus Pedidos</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo do custo — mesma linguagem do PurchaseConfirmDialog. */}
        <div className="space-y-px overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-xs font-medium">
          <div className="flex items-center gap-1.5 border-b border-amber-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-400">
            <Sparkles className="size-3" />
            Pagamento em Aura
          </div>
          {price.discounted && (
            <>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-muted-foreground">Preço do item</span>
                <span className="font-display font-bold tabular-nums text-muted-foreground line-through">
                  {AURA_ICON} {price.listPrice.toLocaleString("pt-BR")}
                </span>
              </div>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ color: "var(--vip-accent)" }}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <Crown className="size-3.5" strokeWidth={2} />
                  Desconto VIP ({price.discountPercent}%)
                </span>
                <span className="font-display font-bold tabular-nums">
                  −{AURA_ICON} {price.savings.toLocaleString("pt-BR")}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground">Custo do resgate</span>
            <span className="font-display font-bold tabular-nums text-amber-400">
              {AURA_ICON} {price.finalPrice.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-amber-500/20 px-3 py-2">
            <span className="text-muted-foreground">Saldo após o resgate</span>
            <span className="font-display font-bold tabular-nums text-foreground">
              {AURA_ICON} {remaining.toLocaleString("pt-BR")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 text-[13px] font-semibold text-foreground">
          <Truck className="size-4 text-emerald-400" />
          Endereço de entrega
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          O produto só é despachado depois deste endereço. Não dá para completar depois: o
          resgate já é o pedido.
        </p>

        <ShippingAddressFields form={form} onChange={setForm} disabled={loading} />

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onConfirm(form)}
            disabled={loading || !isShippingFormComplete(form) || remaining < 0}
            className="w-full gap-2 bg-orange-500 text-[#1a1200] hover:bg-orange-400 sm:w-auto"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {remaining < 0 ? "Saldo insuficiente" : "Resgatar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
