"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RotateCcw, Save, Truck, User } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PayerFields,
  isPayerFormSavable,
  payerFormFromProfile,
  payerFormToPayload,
  type PayerForm,
} from "@/components/store/PayerFields"
import {
  ShippingAddressFields,
  isShippingFormComplete,
  isShippingFormTouched,
  shippingFormFromProfile,
  shippingFormToPayload,
  type ShippingForm,
} from "@/components/store/ShippingAddressFields"
import type { PurchaseProfile } from "@/lib/purchase-profile"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

type SaveResponse = { ok?: boolean; profile?: PurchaseProfile | null; error?: string }

function sameForm<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key])
}

/**
 * Dados de compra em Minha conta: os MESMOS campos de cobrança e entrega do
 * checkout (`PayerFields`, `ShippingAddressFields`), gravados nas mesmas
 * colunas do perfil. Antes eles só eram editáveis no meio de uma compra — no
 * cartão, inclusive, o telefone nem aparecia no PIX —, então trocar de número
 * ou de endereço fora de uma compra não tinha caminho nenhum.
 *
 * Cada card salva sozinho: cobrança e entrega são pessoas e endereços
 * diferentes, e um erro num não pode segurar o outro.
 */
export function PurchaseDataTab() {
  const [profile, setProfile] = useState<PurchaseProfile | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")

  const load = useCallback(async () => {
    setLoadState("loading")
    try {
      const res = await fetch("/api/profile/purchase-data", { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as PurchaseProfile & { email?: string | null }
      setProfile({ payer: data.payer, shipping: data.shipping })
      setEmail(data.email ?? null)
      setLoadState("ready")
    } catch {
      setLoadState("error")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadState === "error" || !profile) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Não foi possível carregar seus dados de compra</p>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
          <RotateCcw className="size-4" />
          Tentar de novo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PayerCard profile={profile} email={email} onSaved={setProfile} />
      <ShippingCard profile={profile} onSaved={setProfile} />
    </div>
  )
}

async function savePurchaseData(body: object): Promise<PurchaseProfile | null> {
  try {
    const res = await fetch("/api/profile/purchase-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as SaveResponse
    if (!res.ok || !data.profile) {
      toast.error("Não foi possível salvar", {
        description: data.error ?? "Tente novamente em instantes",
      })
      return null
    }
    toast.success("Dados salvos")
    return data.profile
  } catch {
    toast.error("Não foi possível salvar", { description: "Verifique sua conexão e tente de novo" })
    return null
  }
}

function SaveBar({
  dirty,
  canSave,
  saving,
  onSave,
  onDiscard,
  hint,
}: {
  dirty: boolean
  canSave: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  hint?: string | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
      <Button type="button" size="sm" onClick={onSave} disabled={!dirty || !canSave || saving} className="gap-1.5">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        Salvar
      </Button>
      {dirty && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          disabled={saving}
          className="text-muted-foreground"
        >
          Descartar alterações
        </Button>
      )}
      {dirty && hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function PayerCard({
  profile,
  email,
  onSaved,
}: {
  profile: PurchaseProfile
  email: string | null
  onSaved: (profile: PurchaseProfile) => void
}) {
  const saved = payerFormFromProfile(profile.payer)
  const [form, setForm] = useState<PayerForm>(saved)
  const [saving, setSaving] = useState(false)
  const dirty = !sameForm(form, saved)
  const canSave = isPayerFormSavable(form)

  async function handleSave() {
    setSaving(true)
    const next = await savePurchaseData({ payer: payerFormToPayload(form, { includeAddress: true }) })
    setSaving(false)
    if (!next) return
    onSaved(next)
    setForm(payerFormFromProfile(next.payer))
  }

  return (
    <Card className={cn(CARD_SURFACE, "shadow-sm")}>
      <CardHeader className="border-b border-border/60">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4 text-primary" />
          Dados da cobrança
        </CardTitle>
        <CardDescription>
          Do titular do pagamento. Nome e CPF vão em toda cobrança; telefone e endereço só no cartão
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {email && (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">E-mail</p>
            <p className="truncate text-sm text-foreground">{email}</p>
          </div>
        )}
        <PayerFields form={form} onChange={setForm} showAddress addressRequired={false} disabled={saving} />
        <SaveBar
          dirty={dirty}
          canSave={canSave}
          saving={saving}
          onSave={handleSave}
          onDiscard={() => setForm(saved)}
          hint={canSave ? null : "Preencha nome e CPF válidos, e o endereço inteiro ou nenhum campo dele"}
        />
      </CardContent>
    </Card>
  )
}

function ShippingCard({
  profile,
  onSaved,
}: {
  profile: PurchaseProfile
  onSaved: (profile: PurchaseProfile) => void
}) {
  const saved = shippingFormFromProfile(profile, { fallbackToPayer: false })
  const [form, setForm] = useState<ShippingForm>(saved)
  const [saving, setSaving] = useState(false)
  const dirty = !sameForm(form, saved)
  const cleared = !isShippingFormTouched(form)
  // Tudo em branco também salva: é como a pessoa apaga a entrega guardada.
  const canSave = cleared || isShippingFormComplete(form)

  async function handleSave() {
    setSaving(true)
    const next = await savePurchaseData({ shipping: cleared ? {} : shippingFormToPayload(form) })
    setSaving(false)
    if (!next) return
    onSaved(next)
    setForm(shippingFormFromProfile(next, { fallbackToPayer: false }))
  }

  return (
    <Card className={cn(CARD_SURFACE, "shadow-sm")}>
      <CardHeader className="border-b border-border/60">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="size-4 text-primary" />
          Endereço de entrega
        </CardTitle>
        <CardDescription>
          De quem recebe o pacote. Preenche a próxima compra; pedidos já feitos mantêm o endereço que tinham
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <ShippingAddressFields form={form} onChange={setForm} disabled={saving} />
        <SaveBar
          dirty={dirty}
          canSave={canSave}
          saving={saving}
          onSave={handleSave}
          onDiscard={() => setForm(saved)}
          hint={
            canSave
              ? cleared
                ? "Salvar vai apagar o endereço de entrega guardado"
                : null
              : "Preencha todos os campos obrigatórios ou deixe tudo em branco"
          }
        />
      </CardContent>
    </Card>
  )
}
