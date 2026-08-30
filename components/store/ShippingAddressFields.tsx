"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BR_STATES } from "@/lib/br-states"
import { formatCepInput, formatPhoneInput } from "@/components/store/CheckoutPayerCard"

export interface ShippingForm {
  recipient: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
}

export const EMPTY_SHIPPING_FORM: ShippingForm = {
  recipient: "",
  phone: "",
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
}

/**
 * Um endereço só serve para despachar se estiver inteiro — a mesma regra do
 * `parseOptionalShippingAddress` no servidor, replicada aqui só para
 * habilitar/desabilitar botão. A validação que vale é a do servidor.
 */
export function isShippingFormComplete(form: ShippingForm): boolean {
  return (
    form.recipient.trim().length >= 2 &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    form.postalCode.replace(/\D/g, "").length === 8 &&
    form.street.trim() !== "" &&
    form.number.trim() !== "" &&
    form.neighborhood.trim() !== "" &&
    form.city.trim() !== "" &&
    form.state.trim().length === 2
  )
}

/** true se a pessoa começou a preencher — usado para recusar envio pela metade. */
export function isShippingFormTouched(form: ShippingForm): boolean {
  return (Object.keys(form) as (keyof ShippingForm)[])
    .filter((key) => key !== "complement")
    .some((key) => form[key].trim() !== "")
}

/** Corpo pronto para as rotas de checkout e de endereço do pedido (mesmo contrato nos dois). */
export function shippingFormToPayload(form: ShippingForm) {
  return {
    shippingRecipient: form.recipient.trim(),
    shippingPhone: form.phone.replace(/\D/g, ""),
    shippingPostalCode: form.postalCode.replace(/\D/g, ""),
    shippingStreet: form.street.trim(),
    shippingNumber: form.number.trim(),
    shippingComplement: form.complement.trim() || undefined,
    shippingNeighborhood: form.neighborhood.trim(),
    shippingCity: form.city.trim(),
    shippingState: form.state.trim().toUpperCase(),
  }
}

export function formatShippingAddressLine(address: {
  street: string
  number: string
  complement?: string | null
  neighborhood: string
  city: string
  state: string
  postal_code: string
}): string {
  return [
    `${address.street}, ${address.number}`,
    address.complement || null,
    address.neighborhood,
    `${address.city}/${address.state}`,
    formatCepInput(address.postal_code),
  ]
    .filter(Boolean)
    .join(" · ")
}

interface CepLookupResponse {
  error?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

/**
 * Campos do endereço de ENTREGA. Compartilhado entre o checkout (antes de
 * gerar a cobrança) e "Meus Pedidos" (quando o cliente pulou e voltou depois
 * de pagar) — o mesmo formulário nos dois lugares evita que as regras de
 * preenchimento divirjam entre as telas.
 */
export function ShippingAddressFields({
  form,
  onChange,
  disabled,
}: {
  form: ShippingForm
  onChange: (next: ShippingForm) => void
  disabled?: boolean
}) {
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)

  function set<K extends keyof ShippingForm>(key: K, value: ShippingForm[K]) {
    onChange({ ...form, [key]: value })
  }

  async function handleCepChange(value: string) {
    const formatted = formatCepInput(value)
    setCepError(null)
    onChange({ ...form, postalCode: formatted })

    const digits = formatted.replace(/\D/g, "")
    if (digits.length !== 8) return

    setCepLoading(true)
    try {
      const res = await fetch(`/api/cep/${digits}`)
      const data = (await res.json()) as CepLookupResponse
      if (!res.ok) {
        setCepError(data.error ?? "Não foi possível buscar o CEP.")
        return
      }
      onChange({
        ...form,
        postalCode: formatted,
        street: data.street ?? "",
        neighborhood: data.neighborhood ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
      })
    } catch {
      setCepError("Não foi possível buscar o CEP.")
    } finally {
      setCepLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Quem vai receber *</Label>
        <Input
          maxLength={200}
          disabled={disabled}
          value={form.recipient}
          onChange={(e) => set("recipient", e.target.value)}
          placeholder="Nome de quem recebe o pacote"
          className="border-border/80 bg-muted/30"
        />
      </div>

      <div className="space-y-2">
        <Label>Telefone de contato *</Label>
        <Input
          inputMode="numeric"
          disabled={disabled}
          value={form.phone}
          onChange={(e) => set("phone", formatPhoneInput(e.target.value))}
          placeholder="(00) 00000-0000"
          maxLength={15}
          className="border-border/80 bg-muted/30"
        />
        <p className="text-[10px] text-muted-foreground/60">
          Usado pela transportadora em caso de problema na entrega.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>CEP *</Label>
          <div className="relative">
            <Input
              inputMode="numeric"
              disabled={disabled}
              value={form.postalCode}
              onChange={(e) => handleCepChange(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="border-border/80 bg-muted/30"
            />
            {cepLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {cepError && <p className="text-[10px] text-red-400">{cepError}</p>}
        </div>
        <div className="space-y-2">
          <Label>Número *</Label>
          <Input
            maxLength={20}
            disabled={disabled}
            value={form.number}
            onChange={(e) => set("number", e.target.value)}
            placeholder="123"
            className="border-border/80 bg-muted/30"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Endereço *</Label>
        <Input
          maxLength={200}
          disabled={disabled}
          value={form.street}
          onChange={(e) => set("street", e.target.value)}
          placeholder="Rua, avenida..."
          className="border-border/80 bg-muted/30"
        />
      </div>

      <div className="space-y-2">
        <Label>Complemento</Label>
        <Input
          maxLength={100}
          disabled={disabled}
          value={form.complement}
          onChange={(e) => set("complement", e.target.value)}
          placeholder="Apto, bloco, referência... (opcional)"
          className="border-border/80 bg-muted/30"
        />
      </div>

      <div className="space-y-2">
        <Label>Bairro *</Label>
        <Input
          maxLength={100}
          disabled={disabled}
          value={form.neighborhood}
          onChange={(e) => set("neighborhood", e.target.value)}
          placeholder="Seu bairro"
          className="border-border/80 bg-muted/30"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label>Cidade *</Label>
          <Input
            maxLength={100}
            disabled={disabled}
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Sua cidade"
            className="border-border/80 bg-muted/30"
          />
        </div>
        <div className="space-y-2">
          <Label>UF *</Label>
          <Select value={form.state} onValueChange={(v) => set("state", v)} disabled={disabled}>
            <SelectTrigger className="w-full border-border/80 bg-muted/30">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              {BR_STATES.map((state) => (
                <SelectItem key={state.uf} value={state.uf}>
                  {state.uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
