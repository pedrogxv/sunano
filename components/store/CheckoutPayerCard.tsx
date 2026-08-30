"use client"

import { useState } from "react"
import { Check, Loader2, MapPin, Pencil, User, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BR_STATES } from "@/lib/br-states"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"

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

export function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, ddd, p1, p2) => (p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`))
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, ddd, p1, p2) => (p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`))
}

export function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.replace(/(\d{5})(\d{1,3})/, "$1-$2")
}

/**
 * CPF exibido parcialmente mascarado: o dado aparece numa tela que a pessoa
 * pode abrir em público, e para conferir "é o meu CPF mesmo?" bastam os
 * últimos dígitos.
 */
function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "")
  if (digits.length !== 11) return cpf
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`
}

interface CepLookupResponse {
  error?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p className="truncate text-sm text-foreground">{value}</p>
    </div>
  )
}

/**
 * Card de "dados da cobrança" do checkout: mostra o que vai ser enviado ao
 * gateway (nome, CPF, e-mail e — só no cartão — telefone e endereço de
 * cobrança) e permite corrigir ali mesmo. Antes esses campos só apareciam
 * quando o perfil estava incompleto, então quem tinha um CPF errado salvo
 * não tinha como perceber nem arrumar sem sair do checkout.
 *
 * O `editing` é controlado pelo pai porque o checkout precisa saber se deve
 * mandar os campos no corpo da requisição (e bloquear o submit enquanto a
 * edição não foi confirmada).
 */
export function CheckoutPayerCard({
  form,
  onChange,
  email,
  requireAddress,
  editing,
  onEditingChange,
  incomplete,
}: {
  form: PayerForm
  onChange: (next: PayerForm) => void
  email: string | null
  /** Cartão exige telefone + endereço de cobrança; PIX não. */
  requireAddress: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  /** Perfil sem os dados obrigatórios — o card abre já em modo de edição. */
  incomplete: boolean
}) {
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  // Snapshot de quando a edição começou, para o "Cancelar" devolver os
  // valores anteriores em vez de deixar o que foi digitado pela metade.
  const [snapshot, setSnapshot] = useState<PayerForm | null>(null)

  function startEditing() {
    setSnapshot(form)
    onEditingChange(true)
  }

  function confirmEditing() {
    setSnapshot(null)
    onEditingChange(false)
  }

  function cancelEditing() {
    if (snapshot) onChange(snapshot)
    setSnapshot(null)
    setCepError(null)
    onEditingChange(false)
  }

  function set<K extends keyof PayerForm>(key: K, value: PayerForm[K]) {
    onChange({ ...form, [key]: value })
  }

  async function handleCepChange(value: string) {
    const formatted = formatCepInput(value)
    setCepError(null)

    const digits = formatted.replace(/\D/g, "")
    if (digits.length !== 8) {
      onChange({ ...form, postalCode: formatted })
      return
    }

    onChange({ ...form, postalCode: formatted })
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

  const addressLine = [
    form.street && form.number ? `${form.street}, ${form.number}` : form.street,
    form.complement || null,
    form.neighborhood || null,
    form.city && form.state ? `${form.city}/${form.state}` : form.city || null,
    form.postalCode || null,
  ]
    .filter(Boolean)
    .join(" · ")

  const canFinishEditing =
    form.name.trim().length >= 2 &&
    form.document.replace(/\D/g, "").length === 11 &&
    (!requireAddress ||
      (form.phone.replace(/\D/g, "").length >= 10 &&
        form.postalCode.replace(/\D/g, "").length === 8 &&
        form.street.trim() !== "" &&
        form.number.trim() !== "" &&
        form.neighborhood.trim() !== "" &&
        form.city.trim() !== "" &&
        form.state.trim() !== ""))

  return (
    <div className={cn("rounded-xl border", CARD_SURFACE)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <User className="size-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-foreground">Dados da cobrança</h2>
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startEditing}
            className="h-7 gap-1.5 text-xs"
          >
            <Pencil className="size-3" />
            Editar
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome completo" value={form.name} />
            <Field label="CPF" value={maskCpf(form.document)} />
            {email && <Field label="E-mail" value={email} />}
            {requireAddress && form.phone && <Field label="Telefone" value={form.phone} />}
          </div>

          {requireAddress && addressLine && (
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Endereço de cobrança
                </p>
                <p className="text-xs text-foreground">{addressLine}</p>
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/70">
            Confira antes de pagar: esses dados vão para a cobrança e ficam salvos no seu perfil.
          </p>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {incomplete && (
            <p className="text-xs text-muted-foreground">
              Faltam alguns dados para gerar a cobrança. Eles ficam salvos no seu perfil.
            </p>
          )}

          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input
              required
              minLength={2}
              maxLength={200}
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
              value={formatCpfInput(form.document)}
              onChange={(e) => set("document", formatCpfInput(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
              className="border-border/80 bg-muted/30"
            />
            <p className="text-[10px] text-muted-foreground/60">
              Exigido pelo Banco Central para identificar o pagador de transações PIX.
            </p>
          </div>

          {requireAddress && (
            <>
              <div className="space-y-2">
                <Label>Telefone *</Label>
                <Input
                  required
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => set("phone", formatPhoneInput(e.target.value))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="border-border/80 bg-muted/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CEP *</Label>
                  <div className="relative">
                    <Input
                      required
                      inputMode="numeric"
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
                    required
                    maxLength={20}
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
                  required
                  maxLength={200}
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
                  value={form.complement}
                  onChange={(e) => set("complement", e.target.value)}
                  placeholder="Apto, bloco... (opcional)"
                  className="border-border/80 bg-muted/30"
                />
              </div>

              <div className="space-y-2">
                <Label>Bairro *</Label>
                <Input
                  required
                  maxLength={100}
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
                    required
                    maxLength={100}
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Sua cidade"
                    className="border-border/80 bg-muted/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label>UF *</Label>
                  <Select value={form.state} onValueChange={(v) => set("state", v)} required>
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

          {/* Sem os dados salvos não há para onde "cancelar" — o card fica
              travado em edição até a pessoa preencher. */}
          {!incomplete && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={confirmEditing}
                disabled={!canFinishEditing}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <Check className="size-3.5" />
                Confirmar dados
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelEditing}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="size-3.5" />
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
