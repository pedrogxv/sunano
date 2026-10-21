"use client"

import { useState } from "react"
import { Check, MapPin, Pencil, User, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PayerFields, isPayerFormComplete, type PayerForm } from "@/components/store/PayerFields"
import { maskCpf } from "@/lib/br-format"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"

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
  loadFailed = false,
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
  /**
   * A consulta do perfil falhou (rede/5xx), então não sabemos o que já está
   * salvo. O card abre em edição igual ao `incomplete`, mas o texto não pode
   * afirmar que "faltam dados" — pode ser que não falte nada.
   */
  loadFailed?: boolean
}) {
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
    onEditingChange(false)
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

  const canFinishEditing = isPayerFormComplete(form, requireAddress)

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
            Confira antes de pagar: esses dados vão para a cobrança e ficam salvos em Minha conta, na área Dados de compra
          </p>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {incomplete && (
            <p className="text-xs text-muted-foreground">
              {loadFailed
                ? "Não conseguimos carregar os dados salvos no seu perfil agora. Confirme-os abaixo para seguir com a cobrança."
                : "Faltam alguns dados para gerar a cobrança. Eles ficam salvos no seu perfil."}
            </p>
          )}

          <PayerFields
            form={form}
            onChange={onChange}
            showAddress={requireAddress}
            addressRequired={requireAddress}
          />

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
            {/* Sem dado salvo não há para onde "cancelar". O "Confirmar"
                fica mesmo assim: escondê-lo junto deixava o card preso em
                edição e o botão de pagar desabilitado para sempre, mesmo com
                tudo preenchido (todo cliente de primeira compra). */}
            {!incomplete && (
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
