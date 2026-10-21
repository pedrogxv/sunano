"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BR_STATES } from "@/lib/br-states"
import { formatCepInput, formatCpfInput, formatPhoneInput, isValidPhone, normalizePhone } from "@/lib/br-format"
import { isValidCPF } from "@/lib/pix-key"
import type { PurchaseProfile } from "@/lib/purchase-profile"

export interface PayerForm {
  name: string
  document: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
}

export const EMPTY_PAYER_FORM: PayerForm = {
  name: "",
  document: "",
  phone: "",
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
}

/** Campos do endereço de cobrança (sem telefone e complemento, que andam soltos). */
const ADDRESS_KEYS = ["postalCode", "street", "number", "neighborhood", "city", "state"] as const

function isAddressComplete(form: PayerForm): boolean {
  return (
    form.postalCode.replace(/\D/g, "").length === 8 &&
    form.street.trim() !== "" &&
    form.number.trim() !== "" &&
    form.neighborhood.trim() !== "" &&
    form.city.trim() !== "" &&
    form.state.trim() !== ""
  )
}

function isAddressEmpty(form: PayerForm): boolean {
  return ADDRESS_KEYS.every((key) => form[key].trim() === "")
}

/**
 * O que a cobrança exige: nome e CPF sempre; no cartão, também telefone e
 * endereço de cobrança. Decide se o card pode sair da edição e se o botão de
 * pagar do checkout libera. A validação que vale é a do servidor.
 */
export function isPayerFormComplete(form: PayerForm, requireAddress: boolean): boolean {
  return (
    form.name.trim().length >= 2 &&
    isValidCPF(form.document) &&
    (!requireAddress || (isValidPhone(form.phone) && isAddressComplete(form)))
  )
}

/**
 * Regra de Minha conta, onde nada é para um pagamento específico: nome e CPF
 * sempre, telefone opcional e endereço inteiro ou vazio — a mesma de
 * `parsePurchaseProfileUpdate` no servidor. Endereço pela metade é recusado
 * porque o checkout de cartão o leria como pronto e mandaria lixo à Asaas.
 */
export function isPayerFormSavable(form: PayerForm): boolean {
  return (
    form.name.trim().length >= 2 &&
    isValidCPF(form.document) &&
    (form.phone.trim() === "" || isValidPhone(form.phone)) &&
    (isAddressEmpty(form) || isAddressComplete(form))
  )
}

/** Perfil salvo → formulário. */
export function payerFormFromProfile(payer: PurchaseProfile["payer"] | null | undefined): PayerForm {
  if (!payer) return EMPTY_PAYER_FORM
  return {
    name: payer.fullName ?? "",
    document: payer.cpf ? formatCpfInput(payer.cpf) : "",
    phone: payer.phone ? formatPhoneInput(payer.phone, { allowInternational: true }) : "",
    postalCode: payer.postalCode ? formatCepInput(payer.postalCode) : "",
    street: payer.street ?? "",
    number: payer.number ?? "",
    complement: payer.complement ?? "",
    neighborhood: payer.neighborhood ?? "",
    city: payer.city ?? "",
    state: payer.state ?? "",
  }
}

/**
 * Corpo com os nomes `guest*` que a rota de checkout e a de Minha conta
 * aceitam. Sem `includeAddress`, só nome e CPF (PIX não pede o resto).
 */
export function payerFormToPayload(form: PayerForm, { includeAddress }: { includeAddress: boolean }) {
  return {
    guestName: form.name.trim(),
    guestDocument: form.document.replace(/\D/g, ""),
    ...(includeAddress
      ? {
          guestPhone: normalizePhone(form.phone),
          guestPostalCode: form.postalCode.replace(/\D/g, ""),
          guestStreet: form.street.trim(),
          guestNumber: form.number.trim(),
          guestComplement: form.complement.trim() || undefined,
          guestNeighborhood: form.neighborhood.trim(),
          guestCity: form.city.trim(),
          guestState: form.state.trim(),
        }
      : {}),
  }
}

interface CepLookupResponse {
  error?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

/**
 * Campos dos dados de COBRANÇA (titular do pagamento). Compartilhado entre o
 * card do checkout e Minha conta, para as regras de preenchimento não
 * divergirem entre as telas — mesmo papel de `ShippingAddressFields` na
 * entrega.
 *
 * `showAddress` mostra telefone e endereço; `addressRequired` marca esses
 * campos com asterisco (no checkout, só o cartão os exige; em Minha conta
 * são opcionais).
 */
export function PayerFields({
  form,
  onChange,
  showAddress,
  addressRequired,
  disabled,
}: {
  form: PayerForm
  onChange: (next: PayerForm) => void
  showAddress: boolean
  addressRequired: boolean
  disabled?: boolean
}) {
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const req = addressRequired ? " *" : ""
  const cpfInvalid = form.document.replace(/\D/g, "").length === 11 && !isValidCPF(form.document)
  // Só acusa depois de um número de tamanho plausível: "+81 90" é digitação em curso
  const phoneInvalid = form.phone.replace(/\D/g, "").length >= 10 && !isValidPhone(form.phone)

  function set<K extends keyof PayerForm>(key: K, value: PayerForm[K]) {
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
        <Label>Nome completo *</Label>
        <Input
          required
          minLength={2}
          maxLength={200}
          autoComplete="name"
          disabled={disabled}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Seu nome completo"
          className="border-border/80 bg-muted/30"
        />
      </div>

      <div className="space-y-2">
        <Label>CPF *</Label>
        <Input
          required
          inputMode="numeric"
          disabled={disabled}
          value={formatCpfInput(form.document)}
          onChange={(e) => set("document", formatCpfInput(e.target.value))}
          placeholder="000.000.000-00"
          maxLength={14}
          aria-invalid={cpfInvalid || undefined}
          className="border-border/80 bg-muted/30"
        />
        {cpfInvalid ? (
          <p className="text-[10px] text-red-400">CPF inválido.</p>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">
            Exigido pelo Banco Central para identificar o pagador de transações PIX.
          </p>
        )}
      </div>

      {showAddress && (
        <>
          <div className="space-y-2">
            <Label>Telefone{req}</Label>
            <Input
              required={addressRequired}
              inputMode="tel"
              autoComplete="tel-national"
              disabled={disabled}
              value={form.phone}
              onChange={(e) => set("phone", formatPhoneInput(e.target.value, { allowInternational: true }))}
              placeholder="(00) 00000-0000"
              maxLength={16}
              aria-invalid={phoneInvalid || undefined}
              className="border-border/80 bg-muted/30"
            />
            {phoneInvalid ? (
              <p className="text-[10px] text-red-400">Telefone inválido</p>
            ) : (
              <p className="text-[10px] text-muted-foreground/60">
                Número de fora do Brasil? Comece com + e o código do país (ex.: +81 90 1234 5678)
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>CEP{req}</Label>
              <div className="relative">
                <Input
                  required={addressRequired}
                  inputMode="numeric"
                  autoComplete="postal-code"
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
              <Label>Número{req}</Label>
              <Input
                required={addressRequired}
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
            <Label>Endereço{req}</Label>
            <Input
              required={addressRequired}
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
              placeholder="Apto, bloco... (opcional)"
              className="border-border/80 bg-muted/30"
            />
          </div>

          <div className="space-y-2">
            <Label>Bairro{req}</Label>
            <Input
              required={addressRequired}
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
              <Label>Cidade{req}</Label>
              <Input
                required={addressRequired}
                maxLength={100}
                disabled={disabled}
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Sua cidade"
                className="border-border/80 bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>UF{req}</Label>
              <Select
                value={form.state}
                onValueChange={(v) => set("state", v)}
                required={addressRequired}
                disabled={disabled}
              >
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
        </>
      )}
    </div>
  )
}
