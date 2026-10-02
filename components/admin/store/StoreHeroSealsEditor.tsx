"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowDown, ArrowUp, BadgeCheck, Plus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { HERO_SEAL_STYLE, HeroSealsBar } from "@/components/store/StoreHero"
import { Alert, AlertDescription } from "@/components/ui/alert"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BANNER_LINK_HINT, isValidBannerLink } from "@/lib/banner-link"
import {
  DEFAULT_HERO_SEALS,
  HERO_SEAL_DESCRIPTION_MAX,
  HERO_SEAL_ICON_LABEL,
  HERO_SEAL_ICONS,
  HERO_SEAL_TITLE_MAX,
  MAX_HERO_SEALS,
  type HeroSealIcon,
  type StoreHeroSeal,
  type StoreHeroSettings,
  type StoreHeroTrust,
} from "@/lib/store-hero"
import { cn } from "@/lib/utils"

type SealRow = { key: string; icon: HeroSealIcon; title: string; description: string; link: string }

type FormState = { sealsEnabled: boolean; showRating: boolean; seals: SealRow[] }

let rowSeed = 0
const newRowKey = () => `seal-${++rowSeed}`

function toRows(seals: StoreHeroSeal[]): SealRow[] {
  return seals.map((seal) => ({
    key: newRowKey(),
    icon: seal.icon,
    title: seal.title,
    description: seal.description ?? "",
    link: seal.link ?? "",
  }))
}

function toSeals(rows: SealRow[]): StoreHeroSeal[] {
  return rows.map((row) => ({
    icon: row.icon,
    title: row.title.trim(),
    description: row.description.trim() || null,
    link: row.link.trim() || null,
  }))
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

/**
 * Selos de curadoria colados no Hero da Loja (`store_hero_settings`). Valem
 * para todos os slides e para a arte estática, por isso ficam fora do editor
 * de slide.
 */
export function StoreHeroSealsEditor() {
  const [form, setForm] = useState<FormState | null>(null)
  const [rating, setRating] = useState<StoreHeroTrust["rating"]>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetch("/api/admin/store-hero/settings")
      .then(async (res) => {
        const data = (await res.json()) as {
          settings?: StoreHeroSettings
          rating?: StoreHeroTrust["rating"]
          error?: string
        }
        if (!res.ok || !data.settings) throw new Error(data.error ?? "Erro ao carregar os selos.")
        if (!active) return
        setForm({
          sealsEnabled: data.settings.sealsEnabled,
          showRating: data.settings.showRating,
          seals: toRows(data.settings.seals),
        })
        setRating(data.rating ?? null)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar os selos.")
      })
    return () => {
      active = false
    }
  }, [])

  const preview = useMemo<StoreHeroTrust | null>(
    () =>
      form
        ? {
            seals: form.sealsEnabled ? toSeals(form.seals).filter((seal) => seal.title) : [],
            rating: form.showRating ? rating : null,
          }
        : null,
    [form, rating]
  )

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
      <div className="flex justify-center py-10">
        <BoxLoader />
      </div>
    )
  }

  const patch = (next: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...next } : prev))
  const patchSeal = (key: string, next: Partial<SealRow>) =>
    patch({ seals: form.seals.map((row) => (row.key === key ? { ...row, ...next } : row)) })
  const moveSeal = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= form.seals.length) return
    const next = [...form.seals]
    ;[next[index], next[target]] = [next[target], next[index]]
    patch({ seals: next })
  }

  async function handleSave() {
    if (!form) return
    for (const row of form.seals) {
      if (!row.title.trim()) {
        toast.error("Todo selo precisa de um título (ou remova a linha vazia).")
        return
      }
      if (row.link.trim() && !isValidBannerLink(row.link.trim())) {
        toast.error(`Link inválido em "${row.title.trim()}"`, { description: BANNER_LINK_HINT })
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch("/api/admin/store-hero/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sealsEnabled: form.sealsEnabled,
          showRating: form.showRating,
          seals: toSeals(form.seals),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar os selos.")
      toast.success("Selos salvos", { description: "A Loja já mostra a versão nova." })
    } catch (err) {
      toast.error("Erro ao salvar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const hasPreview = preview.seals.length > 0 || preview.rating

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <BadgeCheck className="size-4" />
            Selos de curadoria
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Faixa colada embaixo do Hero, em todos os slides e também na arte padrão. Diz por que comprar na Loja
            Sunano. Até {MAX_HERO_SEALS} selos; a descrição só aparece no desktop.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => patch({ seals: toRows(DEFAULT_HERO_SEALS) })}
        >
          <RotateCcw className="size-3.5" />
          Restaurar padrão
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {hasPreview ? (
          <HeroSealsBar trust={preview} />
        ) : (
          <p className="px-4 py-3 text-xs text-muted-foreground">A faixa não aparece na Loja.</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Mostrar selos</p>
            <p className="text-[11px] text-muted-foreground">Desligado, só a nota dos compradores fica.</p>
          </div>
          <Switch checked={form.sealsEnabled} onChange={(sealsEnabled) => patch({ sealsEnabled })} label="Mostrar selos" />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Nota dos compradores</p>
            <p className="text-[11px] text-muted-foreground">
              {rating
                ? "Média das avaliações publicadas, com link para /loja/avaliacoes."
                : "Ainda sem avaliação publicada: aparece sozinha depois da primeira."}
            </p>
          </div>
          <Switch checked={form.showRating} onChange={(showRating) => patch({ showRating })} label="Nota dos compradores" />
        </div>
      </div>

      <div className="space-y-2">
        {form.seals.map((row, index) => {
          const Icon = HERO_SEAL_STYLE[row.icon].icon
          return (
            <div key={row.key} className="grid gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[150px_1fr_auto]">
              <Select value={row.icon} onValueChange={(icon) => patchSeal(row.key, { icon: icon as HeroSealIcon })}>
                <SelectTrigger className="h-9 w-full" aria-label="Ícone">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <Icon className="size-3.5" style={{ color: HERO_SEAL_STYLE[row.icon].tint }} />
                      {HERO_SEAL_ICON_LABEL[row.icon]}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HERO_SEAL_ICONS.map((icon) => {
                    const OptionIcon = HERO_SEAL_STYLE[icon].icon
                    return (
                      <SelectItem key={icon} value={icon}>
                        <span className="flex items-center gap-2">
                          <OptionIcon className="size-3.5" style={{ color: HERO_SEAL_STYLE[icon].tint }} />
                          {HERO_SEAL_ICON_LABEL[icon]}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label="Título do selo"
                  placeholder="Ex.: Produtos testados"
                  maxLength={HERO_SEAL_TITLE_MAX}
                  value={row.title}
                  onChange={(event) => patchSeal(row.key, { title: event.target.value })}
                  className="h-9"
                />
                <Input
                  aria-label="Link do selo"
                  placeholder="Link, opcional (ex.: /tierlist)"
                  value={row.link}
                  onChange={(event) => patchSeal(row.key, { link: event.target.value })}
                  className="h-9"
                />
                <Input
                  aria-label="Descrição do selo"
                  placeholder="Descrição curta, opcional (só no desktop)"
                  maxLength={HERO_SEAL_DESCRIPTION_MAX}
                  value={row.description}
                  onChange={(event) => patchSeal(row.key, { description: event.target.value })}
                  className="h-9 sm:col-span-2"
                />
              </div>
              <div className="flex items-start justify-end gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground"
                  aria-label="Subir"
                  disabled={index === 0}
                  onClick={() => moveSeal(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground"
                  aria-label="Descer"
                  disabled={index === form.seals.length - 1}
                  onClick={() => moveSeal(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-red-500/60 hover:text-red-400"
                  aria-label="Remover selo"
                  onClick={() => patch({ seals: form.seals.filter((item) => item.key !== row.key) })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
        {form.seals.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Sem selos, a faixa mostra só a nota dos compradores (se ligada).
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={form.seals.length >= MAX_HERO_SEALS}
          onClick={() =>
            patch({
              seals: [...form.seals, { key: newRowKey(), icon: "shield", title: "", description: "", link: "" }],
            })
          }
        >
          <Plus className="size-3.5" />
          Adicionar selo
          <span className="text-muted-foreground">
            ({form.seals.length}/{MAX_HERO_SEALS})
          </span>
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar selos"}
        </Button>
      </div>
    </section>
  )
}
