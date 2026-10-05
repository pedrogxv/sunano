"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BR_STATES } from "@/lib/br-states"
import { formatCepInput, formatCpfInput, formatPhoneInput } from "@/components/store/CheckoutPayerCard"
import { isValidCPF } from "@/lib/pix-key"

export type ShippingResidenceType = "house" | "apartment"

export const SHIPPING_RESIDENCE_TYPE_LABELS: Record<ShippingResidenceType, string> = {
  house: "Casa",
  apartment: "Apartamento",
}

/** Valor cru do banco → tipo do formulário ("" quando nunca foi informado). */
export function toShippingResidenceType(value: string | null | undefined): ShippingResidenceType | "" {
  return value === "house" || value === "apartment" ? value : ""
}

/**
 * Campos na ORDEM que a importação exige (e que o formulário mostra): nome
 * completo, endereço completo com CEP e casa/apartamento, CPF do mesmo nome,
 * celular e nascimento do mesmo CPF. Tudo de quem RECEBE, não do pagador.
 */
export interface ShippingForm {
  recipient: string
  postalCode: string
  residenceType: ShippingResidenceType | ""
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  cpf: string
  phone: string
  /** DD/MM/AAAA, como a pessoa digita. Vai para o servidor em ISO. */
  birthDate: string
}

export const EMPTY_SHIPPING_FORM: ShippingForm = {
  recipient: "",
  postalCode: "",
  residenceType: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  cpf: "",
  phone: "",
  birthDate: "",
}

/** Nome e sobrenome: só o primeiro nome não casa com o CPF na alfândega. */
function isFullName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.split(/\s+/).length >= 2
}

/** DDD + 9 dígitos começando em 9, a mesma regra do servidor. */
function isMobilePhone(value: string): boolean {
  return /^\d{2}9\d{8}$/.test(value.replace(/\D/g, ""))
}

export function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3")
}

/**
 * "DD/MM/AAAA" → "AAAA-MM-DD", ou `null` se não for uma data de nascimento
 * possível. Confere o calendário de verdade (31/02 não passa) e recusa data
 * futura e ano antes de 1900, os mesmos limites do servidor.
 */
export function birthDateInputToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, dd, mm, yyyy] = match
  const iso = `${yyyy}-${mm}-${dd}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null
  if (Number(yyyy) < 1900 || date.getTime() > Date.now()) return null
  return iso
}

/** "AAAA-MM-DD" (coluna `date`) → "DD/MM/AAAA" para o campo. */
export function isoToBirthDateInput(iso: string | null | undefined): string {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ""
}

/**
 * Um endereço só serve para despachar se estiver inteiro — a mesma regra do
 * `parseOptionalShippingAddress` no servidor, replicada aqui só para
 * habilitar/desabilitar botão. A validação que vale é a do servidor.
 */
export function isShippingFormComplete(form: ShippingForm): boolean {
  return (
    isFullName(form.recipient) &&
    form.postalCode.replace(/\D/g, "").length === 8 &&
    form.residenceType !== "" &&
    form.street.trim() !== "" &&
    form.number.trim() !== "" &&
    (form.residenceType !== "apartment" || form.complement.trim() !== "") &&
    form.neighborhood.trim() !== "" &&
    form.city.trim() !== "" &&
    form.state.trim().length === 2 &&
    isValidCPF(form.cpf) &&
    isMobilePhone(form.phone) &&
    birthDateInputToIso(form.birthDate) !== null
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
    shippingCpf: form.cpf.replace(/\D/g, ""),
    shippingBirthDate: birthDateInputToIso(form.birthDate) ?? "",
    shippingResidenceType: form.residenceType,
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
  // Só acusa depois do campo inteiro digitado: "12/0" é digitação em curso, não erro.
  const birthDateInvalid = form.birthDate.length === 10 && birthDateInputToIso(form.birthDate) === null
  const cpfInvalid = form.cpf.replace(/\D/g, "").length === 11 && !isValidCPF(form.cpf)
  const phoneDigits = form.phone.replace(/\D/g, "")
  const phoneInvalid = phoneDigits.length >= 10 && !isMobilePhone(form.phone)
  // Nome só é julgado quando a pessoa já saiu dele parcialmente: sem espaço
  // nenhum e com o resto do formulário em branco ainda é digitação.
  const recipientInvalid = form.recipient.trim().length >= 2 && !isFullName(form.recipient) && form.postalCode !== ""
  const isApartment = form.residenceType === "apartment"

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
        <Label>Nome completo *</Label>
        <Input
          maxLength={200}
          autoComplete="name"
          disabled={disabled}
          value={form.recipient}
          onChange={(e) => set("recipient", e.target.value)}
          placeholder="Nome e sobrenome de quem recebe o pacote"
          className="border-border/80 bg-muted/30"
        />
        {recipientInvalid && (
          <p className="text-[10px] text-red-400">Informe nome e sobrenome.</p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-foreground">Endereço completo</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>CEP *</Label>
            <div className="relative">
              <Input
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
            <Label>Casa ou apartamento? *</Label>
            <Select
              value={form.residenceType}
              onValueChange={(v) => set("residenceType", v as ShippingResidenceType)}
              disabled={disabled}
            >
              <SelectTrigger className="w-full border-border/80 bg-muted/30">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SHIPPING_RESIDENCE_TYPE_LABELS) as ShippingResidenceType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {SHIPPING_RESIDENCE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-2">
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
          <Label>{isApartment ? "Complemento *" : "Complemento"}</Label>
          <Input
            maxLength={100}
            disabled={disabled}
            value={form.complement}
            onChange={(e) => set("complement", e.target.value)}
            placeholder={isApartment ? "Apto e bloco (ex.: Apto 52, Bloco B)" : "Referência... (opcional)"}
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

      <div className="space-y-2">
        <Label>CPF *</Label>
        <Input
          inputMode="numeric"
          disabled={disabled}
          value={form.cpf}
          onChange={(e) => set("cpf", formatCpfInput(e.target.value))}
          placeholder="000.000.000-00"
          maxLength={14}
          aria-invalid={cpfInvalid || undefined}
          className="border-border/80 bg-muted/30"
        />
        {cpfInvalid ? (
          <p className="text-[10px] text-red-400">CPF inválido.</p>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">Do mesmo titular do nome acima.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Celular *</Label>
        <Input
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled}
          value={form.phone}
          onChange={(e) => set("phone", formatPhoneInput(e.target.value))}
          placeholder="(00) 90000-0000"
          maxLength={15}
          aria-invalid={phoneInvalid || undefined}
          className="border-border/80 bg-muted/30"
        />
        {phoneInvalid ? (
          <p className="text-[10px] text-red-400">Informe um celular com DDD.</p>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">
            Usado pela transportadora em caso de problema na entrega.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Data de nascimento *</Label>
        <Input
          inputMode="numeric"
          autoComplete="bday"
          disabled={disabled}
          value={form.birthDate}
          onChange={(e) => set("birthDate", formatBirthDateInput(e.target.value))}
          placeholder="DD/MM/AAAA"
          maxLength={10}
          aria-invalid={birthDateInvalid || undefined}
          className="border-border/80 bg-muted/30"
        />
        {birthDateInvalid ? (
          <p className="text-[10px] text-red-400">Data inválida.</p>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">
            Do mesmo titular do CPF. Exigida pela alfândega para liberar produtos importados.
          </p>
        )}
      </div>
    </div>
  )
}
