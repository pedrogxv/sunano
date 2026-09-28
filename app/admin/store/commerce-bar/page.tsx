"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowDown, ArrowUp, CalendarClock, Megaphone, Plus, RotateCcw, ShoppingBag, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { StoreProductPicker } from "@/components/admin/StoreProductPicker"
import { usePageHeader } from "@/components/providers/page-header-context"
import {
  COMMERCE_BENEFIT_ICON_COMPONENT,
  COMMERCE_CAMPAIGN_TONE_CLASS,
  StoreCommerceBar,
} from "@/components/store/StoreCommerceBar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BANNER_LINK_HINT, isValidBannerLink } from "@/lib/banner-link"
import { fromLocalInput, toLocalInput } from "@/lib/datetime-local"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"
import {
  COMMERCE_BENEFIT_ICON_LABEL,
  COMMERCE_BENEFIT_ICONS,
  COMMERCE_BENEFIT_TEXT_MAX,
  COMMERCE_CAMPAIGN_LINK_TEXT_MAX,
  COMMERCE_CAMPAIGN_TEXT_MAX,
  COMMERCE_CAMPAIGN_TONE_LABEL,
  COMMERCE_CAMPAIGN_TONES,
  DEFAULT_COMMERCE_BENEFITS,
  isCommerceCampaignLive,
  MAX_COMMERCE_BENEFITS,
  type CommerceBenefitIcon,
  type CommerceCampaignTone,
  type StoreCommerceBarConfig,
} from "@/lib/store-commerce-bar"
import { productHref } from "@/lib/store-hero"
import { cn } from "@/lib/utils"

/** Linha do editor: `key` estável para o React não misturar os campos ao reordenar. */
type BenefitRow = { key: string; icon: CommerceBenefitIcon; text: string; link: string }

type FormState = {
  isEnabled: boolean
  benefits: BenefitRow[]
  campaignEnabled: boolean
  campaignText: string
  campaignLinkText: string
  campaignLink: string
  campaignProduct: StoreProductCard | null
  campaignTone: CommerceCampaignTone
  campaignStartsAt: string
  campaignEndsAt: string
}

let rowSeed = 0
const newRowKey = () => `benefit-${++rowSeed}`

function toForm(config: StoreCommerceBarConfig, campaignProduct: StoreProductCard | null): FormState {
  return {
    isEnabled: config.isEnabled,
    benefits: config.benefits.map((benefit) => ({
      key: newRowKey(),
      icon: benefit.icon,
      text: benefit.text,
      link: benefit.link ?? "",
    })),
    campaignEnabled: config.campaign.enabled,
    campaignText: config.campaign.text ?? "",
    campaignLinkText: config.campaign.linkText ?? "",
    campaignLink: config.campaign.link ?? "",
    campaignProduct,
    campaignTone: config.campaign.tone,
    campaignStartsAt: toLocalInput(config.campaign.startsAt),
    campaignEndsAt: toLocalInput(config.campaign.endsAt),
  }
}

/** A configuração que a vitrine receberia com o formulário atual (para a prévia). */
function toConfig(form: FormState): StoreCommerceBarConfig {
  const link = form.campaignLink.trim() || null
  return {
    isEnabled: form.isEnabled,
    benefits: form.benefits
      .filter((row) => row.text.trim())
      .map((row) => ({ icon: row.icon, text: row.text.trim(), link: row.link.trim() || null })),
    campaign: {
      enabled: form.campaignEnabled,
      text: form.campaignText.trim() || null,
      linkText: form.campaignLinkText.trim() || null,
      link,
      productId: form.campaignProduct?.id ?? null,
      tone: form.campaignTone,
      startsAt: fromLocalInput(form.campaignStartsAt),
      endsAt: fromLocalInput(form.campaignEndsAt),
      href: link ?? (form.campaignProduct ? productHref(form.campaignProduct.slug) : null),
    },
  }
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-emerald-500" : "bg-muted-foreground/30"
      )}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  )
}

export default function AdminStoreCommerceBarPage() {
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  usePageHeader(
    "Barra comercial",
    "Faixa fina logo abaixo do menu da Loja, em todas as páginas: benefícios ou uma campanha."
  )

  useEffect(() => {
    let active = true
    fetch("/api/admin/store-commerce-bar")
      .then(async (res) => {
        const data = (await res.json()) as {
          config?: StoreCommerceBarConfig
          campaignProduct?: StoreProductCard | null
          error?: string
        }
        if (!res.ok || !data.config) throw new Error(data.error ?? "Erro ao carregar a barra comercial.")
        if (active) setForm(toForm(data.config, data.campaignProduct ?? null))
      })
      .catch((err) => {
        if (!active) return
        const message = err instanceof Error ? err.message : "Erro ao carregar a barra comercial."
        setError(message)
        toast.error("Erro ao carregar", { description: message })
      })
    return () => {
      active = false
    }
  }, [])

  const preview = useMemo(() => (form ? toConfig(form) : null), [form])
  // `Date.now()` só na hora de desenhar: a prévia diz se a campanha estaria no ar AGORA.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  if (error && !form) {
    return (
      <Alert className="border-red-500/30 bg-red-500/10 py-2">
        <AlertCircle className="size-3.5 text-red-400" />
        <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
      </Alert>
    )
  }

  if (!form || !preview) {
    return (
      <div className="flex justify-center py-14">
        <BoxLoader />
      </div>
    )
  }

  const patch = (next: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...next } : prev))
  const patchBenefit = (key: string, next: Partial<BenefitRow>) =>
    patch({ benefits: form.benefits.map((row) => (row.key === key ? { ...row, ...next } : row)) })
  const moveBenefit = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= form.benefits.length) return
    const next = [...form.benefits]
    ;[next[index], next[target]] = [next[target], next[index]]
    patch({ benefits: next })
  }

  const campaignLive = isCommerceCampaignLive(preview.campaign, now)
  const campaignScheduled =
    form.campaignEnabled && !campaignLive && Boolean(preview.campaign.startsAt) && Date.parse(preview.campaign.startsAt!) > now

  async function handleSave() {
    if (!form) return
    for (const row of form.benefits) {
      if (!row.text.trim()) {
        toast.error("Todo benefício precisa de um texto (ou remova a linha vazia).")
        return
      }
      if (row.link.trim() && !isValidBannerLink(row.link.trim())) {
        toast.error(`Link inválido em "${row.text.trim()}"`, { description: BANNER_LINK_HINT })
        return
      }
    }
    if (form.campaignEnabled && !form.campaignText.trim()) {
      toast.error("Escreva o texto da campanha ou desligue o modo campanha.")
      return
    }
    if (form.campaignLink.trim() && !isValidBannerLink(form.campaignLink.trim())) {
      toast.error("Link da campanha inválido", { description: BANNER_LINK_HINT })
      return
    }
    const startsAt = fromLocalInput(form.campaignStartsAt)
    const endsAt = fromLocalInput(form.campaignEndsAt)
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      toast.error("O fim da campanha precisa ser depois do início.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/admin/store-commerce-bar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled: form.isEnabled,
          benefits: form.benefits.map((row) => ({
            icon: row.icon,
            text: row.text.trim(),
            link: row.link.trim() || null,
          })),
          campaignEnabled: form.campaignEnabled,
          campaignText: form.campaignText.trim() || null,
          campaignLinkText: form.campaignLinkText.trim() || null,
          campaignLink: form.campaignLink.trim() || null,
          campaignProductId: form.campaignProduct?.id ?? null,
          campaignTone: form.campaignTone,
          campaignStartsAt: startsAt,
          campaignEndsAt: endsAt,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar a barra comercial.")
      toast.success("Barra comercial salva", { description: "A Loja já mostra a versão nova." })
    } catch (err) {
      toast.error("Erro ao salvar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Prévia */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Prévia</h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              !form.isEnabled
                ? "bg-slate-500/10 text-muted-foreground"
                : campaignLive
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
            )}
          >
            {!form.isEnabled
              ? "Barra desligada"
              : campaignLive
                ? "Mostrando a campanha"
                : campaignScheduled
                  ? "Mostrando benefícios (campanha agendada)"
                  : "Mostrando benefícios"}
          </span>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Desktop</p>
          <div className="overflow-hidden rounded-lg border border-border">
            {form.isEnabled ? (
              <StoreCommerceBar config={preview} now={now} />
            ) : (
              <p className="px-4 py-2.5 text-xs text-muted-foreground">A barra não aparece na Loja.</p>
            )}
          </div>
          <p className="pt-1 text-[11px] text-muted-foreground">Celular (um benefício por vez)</p>
          <div className="max-w-[375px] overflow-hidden rounded-lg border border-border">
            {form.isEnabled ? (
              <StoreCommerceBar config={preview} now={now} />
            ) : (
              <p className="px-4 py-2.5 text-xs text-muted-foreground">A barra não aparece na Loja.</p>
            )}
          </div>
        </div>
      </section>

      {/* Ligada */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Barra ativa</p>
          <p className="text-[11px] text-muted-foreground">Desligada, some de todas as páginas da Loja.</p>
        </div>
        <Switch checked={form.isEnabled} onChange={(isEnabled) => patch({ isEnabled })} label="Barra ativa" />
      </div>

      {/* Benefícios */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Benefícios</h2>
            <p className="text-[11px] text-muted-foreground">
              Frases curtas, até {COMMERCE_BENEFIT_TEXT_MAX} caracteres. Aparecem quando não há campanha no ar.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() =>
              patch({
                benefits: DEFAULT_COMMERCE_BENEFITS.map((benefit) => ({
                  key: newRowKey(),
                  icon: benefit.icon,
                  text: benefit.text,
                  link: benefit.link ?? "",
                })),
              })
            }
          >
            <RotateCcw className="size-3.5" />
            Restaurar padrão
          </Button>
        </div>

        <div className="space-y-2">
          {form.benefits.map((row, index) => {
            const Icon = COMMERCE_BENEFIT_ICON_COMPONENT[row.icon]
            return (
              <div key={row.key} className="grid gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[150px_1fr_1fr_auto]">
                <Select value={row.icon} onValueChange={(icon) => patchBenefit(row.key, { icon: icon as CommerceBenefitIcon })}>
                  <SelectTrigger className="h-9 w-full" aria-label="Ícone">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <Icon className="size-3.5 text-emerald-400" />
                        {COMMERCE_BENEFIT_ICON_LABEL[row.icon]}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COMMERCE_BENEFIT_ICONS.map((icon) => {
                      const OptionIcon = COMMERCE_BENEFIT_ICON_COMPONENT[icon]
                      return (
                        <SelectItem key={icon} value={icon}>
                          <span className="flex items-center gap-2">
                            <OptionIcon className="size-3.5 text-emerald-400" />
                            {COMMERCE_BENEFIT_ICON_LABEL[icon]}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Texto do benefício"
                  placeholder="Ex.: PIX com desconto"
                  maxLength={COMMERCE_BENEFIT_TEXT_MAX}
                  value={row.text}
                  onChange={(event) => patchBenefit(row.key, { text: event.target.value })}
                  className="h-9"
                />
                <Input
                  aria-label="Link do benefício"
                  placeholder="Link, opcional (ex.: /suporte)"
                  value={row.link}
                  onChange={(event) => patchBenefit(row.key, { link: event.target.value })}
                  className="h-9"
                />
                <div className="flex items-center justify-end gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    aria-label="Subir"
                    disabled={index === 0}
                    onClick={() => moveBenefit(index, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    aria-label="Descer"
                    disabled={index === form.benefits.length - 1}
                    onClick={() => moveBenefit(index, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-red-500/60 hover:text-red-400"
                    aria-label="Remover benefício"
                    onClick={() => patch({ benefits: form.benefits.filter((item) => item.key !== row.key) })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
          {form.benefits.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Sem benefícios, a barra só aparece quando houver campanha no ar.
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={form.benefits.length >= MAX_COMMERCE_BENEFITS}
          onClick={() =>
            patch({ benefits: [...form.benefits, { key: newRowKey(), icon: "shield", text: "", link: "" }] })
          }
        >
          <Plus className="size-3.5" />
          Adicionar benefício
          <span className="text-muted-foreground">
            ({form.benefits.length}/{MAX_COMMERCE_BENEFITS})
          </span>
        </Button>
      </section>

      {/* Campanha */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Megaphone className="size-4" />
              Modo campanha
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Troca os benefícios por um aviso só, com link. Fora do período, a barra volta aos benefícios sozinha.
            </p>
          </div>
          <Switch
            checked={form.campaignEnabled}
            onChange={(campaignEnabled) => patch({ campaignEnabled })}
            label="Modo campanha"
          />
        </div>

        <div className={cn("space-y-4", !form.campaignEnabled && "opacity-60")}>
          <div className="space-y-2">
            <Label htmlFor="campaign-text">Texto</Label>
            <Input
              id="campaign-text"
              placeholder="Ex.: 🔥 Beast X V2 em pré-venda"
              maxLength={COMMERCE_CAMPAIGN_TEXT_MAX}
              value={form.campaignText}
              onChange={(event) => patch({ campaignText: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ShoppingBag className="size-3.5" />
              Produto da campanha, opcional
            </Label>
            <StoreProductPicker
              value={form.campaignProduct}
              onChange={(campaignProduct) => patch({ campaignProduct })}
            />
            <p className="text-[11px] text-muted-foreground">Com produto e sem link, a barra leva para a página dele.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-link-text">Texto do link</Label>
              <Input
                id="campaign-link-text"
                placeholder={form.campaignProduct ? "Ver produto" : "Saiba mais"}
                maxLength={COMMERCE_CAMPAIGN_LINK_TEXT_MAX}
                value={form.campaignLinkText}
                onChange={(event) => patch({ campaignLinkText: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-link">Link</Label>
              <Input
                id="campaign-link"
                placeholder={form.campaignProduct ? "Vazio = página do produto" : "/loja?ofertas=1#produtos"}
                value={form.campaignLink}
                onChange={(event) => patch({ campaignLink: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COMMERCE_CAMPAIGN_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => patch({ campaignTone: tone })}
                  aria-pressed={form.campaignTone === tone}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    form.campaignTone === tone
                      ? "border-foreground/40 bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className={cn("size-2.5 rounded-full", COMMERCE_CAMPAIGN_TONE_CLASS[tone].swatch)} />
                  {COMMERCE_CAMPAIGN_TONE_LABEL[tone]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              Período, opcional
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="campaign-starts" className="text-[11px] text-muted-foreground">
                  Começa
                </Label>
                <Input
                  id="campaign-starts"
                  type="datetime-local"
                  value={form.campaignStartsAt}
                  onChange={(event) => patch({ campaignStartsAt: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campaign-ends" className="text-[11px] text-muted-foreground">
                  Termina
                </Label>
                <Input
                  id="campaign-ends"
                  type="datetime-local"
                  value={form.campaignEndsAt}
                  onChange={(event) => patch({ campaignEndsAt: event.target.value })}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Vazio = sem limite enquanto o modo campanha estiver ligado.</p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar barra comercial"}
        </Button>
      </div>
    </div>
  )
}
