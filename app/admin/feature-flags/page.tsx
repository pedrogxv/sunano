"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  Crown,
  FlaskConical,
  Globe,
  History,
  Loader2,
  Percent,
  Power,
  Rocket,
  Search,
  ShieldCheck,
  UserPlus,
  Wrench,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { SunanoLoader } from "@/components/ui/SunanoLoader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_MODES,
  FEATURE_FLAG_MODE_META,
  STALE_RELEASE_FLAG_DAYS,
  type FeatureFlagConfig,
  type FeatureFlagKey,
  type FeatureFlagKind,
  type FeatureFlagMode,
} from "@/lib/feature-flags"
import type {
  AdminFeatureFlagsData,
  AllowlistUser,
  FeatureFlagEvent,
} from "@/lib/server/repositories/feature-flags-repository"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { cn } from "@/lib/utils"

const MODE_ICON: Record<FeatureFlagMode, React.ElementType> = {
  off: Power,
  webmaster: Crown,
  staff: ShieldCheck,
  percentage: Percent,
  everyone: Globe,
}

/** Cor do modo: vai do apagado (off) ao verde (público), na ordem da escada de liberação. */
const MODE_TONE: Record<FeatureFlagMode, string> = {
  off: "data-[active=true]:bg-zinc-500/20 data-[active=true]:text-zinc-200 data-[active=true]:ring-zinc-400/40",
  webmaster: "data-[active=true]:bg-violet-500/15 data-[active=true]:text-violet-200 data-[active=true]:ring-violet-400/40",
  staff: "data-[active=true]:bg-sky-500/15 data-[active=true]:text-sky-200 data-[active=true]:ring-sky-400/40",
  percentage: "data-[active=true]:bg-amber-500/15 data-[active=true]:text-amber-200 data-[active=true]:ring-amber-400/40",
  everyone: "data-[active=true]:bg-emerald-500/15 data-[active=true]:text-emerald-200 data-[active=true]:ring-emerald-400/40",
}

const KIND_META: Record<FeatureFlagKind, { label: string; icon: React.ElementType; hint: string }> = {
  release: { label: "Lançamento", icon: Rocket, hint: "Nasce para morrer: apague depois de liberar para todos" },
  ops: { label: "Operação", icon: Wrench, hint: "Chave de desligar algo em produção; pode ficar" },
  experiment: { label: "Experimento", icon: FlaskConical, hint: "Comparação com prazo" },
}

const ROLLOUT_PRESETS = [1, 5, 10, 25, 50, 100]

type Draft = Pick<FeatureFlagConfig, "mode" | "rolloutPercent" | "allowUserIds" | "note">

function toDraft(config: FeatureFlagConfig): Draft {
  return {
    mode: config.mode,
    rolloutPercent: config.rolloutPercent,
    allowUserIds: config.allowUserIds,
    note: config.note,
  }
}

function sameDraft(a: Draft, b: Draft) {
  return (
    a.mode === b.mode &&
    a.rolloutPercent === b.rolloutPercent &&
    (a.note ?? "") === (b.note ?? "") &&
    a.allowUserIds.length === b.allowUserIds.length &&
    a.allowUserIds.every((id) => b.allowUserIds.includes(id))
  )
}

function daysSince(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function relativeTime(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "agora"
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)}h`
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

/** "Quem vê agora", em uma frase — o resumo que o WEB Master confere antes de salvar. */
function audienceSummary(draft: Draft) {
  const testers = draft.allowUserIds.length
  const plusTesters = testers > 0 ? ` + ${testers} ${testers === 1 ? "testador" : "testadores"}` : ""
  switch (draft.mode) {
    case "off":
      return "Ninguém"
    case "webmaster":
      return `Só WEB Master${plusTesters}`
    case "staff":
      return `Toda a equipe do painel${plusTesters}`
    case "percentage":
      return `Equipe${plusTesters} + ${draft.rolloutPercent}% dos membros logados`
    case "everyone":
      return "Todo mundo, inclusive visitantes sem conta"
  }
}

export default function AdminFeatureFlagsPage() {
  usePageHeader("Feature flags", "Ligue e desligue partes do site sem deploy. Só o WEB Master vê esta tela")

  const [data, setData] = useState<AdminFeatureFlagsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/feature-flags", { cache: "no-store" })
      const body = (await res.json()) as AdminFeatureFlagsData & { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Erro ao carregar")
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!data) return <SunanoLoader />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-4">
        {FEATURE_FLAG_KEYS.map((key) => (
          <FlagCard
            key={key}
            flagKey={key}
            config={data.configs[key]}
            users={data.users}
            onSaved={setData}
          />
        ))}
      </div>

      <AuditLog events={data.events} />
    </div>
  )
}

function FlagCard({
  flagKey,
  config,
  users,
  onSaved,
}: {
  flagKey: FeatureFlagKey
  config: FeatureFlagConfig
  users: Record<string, AllowlistUser>
  onSaved: (data: AdminFeatureFlagsData) => void
}) {
  const definition = FEATURE_FLAGS[flagKey]
  const kind = KIND_META[definition.kind]
  const [draft, setDraft] = useState<Draft>(() => toDraft(config))
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [knownUsers, setKnownUsers] = useState(users)

  // Depois de salvar, o servidor manda o estado novo: o rascunho volta a ser ele.
  useEffect(() => {
    setDraft(toDraft(config))
  }, [config])
  useEffect(() => {
    setKnownUsers((current) => ({ ...current, ...users }))
  }, [users])

  const saved = toDraft(config)
  const dirty = !sameDraft(draft, saved)
  const ageDays = daysSince(`${definition.createdAt}T00:00:00`)
  const publicForDays = config.mode === "everyone" ? daysSince(config.updatedAt) : null
  const isStale =
    definition.kind === "release" && publicForDays !== null && publicForDays >= STALE_RELEASE_FLAG_DAYS

  const save = async (next: Draft) => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: flagKey, ...next }),
      })
      const body = (await res.json()) as AdminFeatureFlagsData & { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Erro ao salvar")
      onSaved(body)
      toast.success(`${definition.label}: ${FEATURE_FLAG_MODE_META[next.mode].label}`, {
        description: audienceSummary(next),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
      setConfirmOpen(false)
    }
  }

  // Ir a público pede confirmação digitada: é o único passo que chega a quem
  // não é da casa, e um clique errado na escada não pode ser isso.
  const requestSave = () => {
    if (draft.mode === "everyone" && saved.mode !== "everyone") setConfirmOpen(true)
    else save(draft)
  }

  const killSwitch = () => save({ ...saved, mode: "off" })

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{definition.label}</h2>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{flagKey}</code>
            <span
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              title={kind.hint}
            >
              <kind.icon className="size-3" />
              {kind.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{definition.description}</p>
          <p className="text-[11px] text-muted-foreground/80">
            Age em: {definition.surfaces.join(" · ")}
            {ageDays !== null && <> · no código há {ageDays} {ageDays === 1 ? "dia" : "dias"}</>}
          </p>
        </div>

        {saved.mode !== "off" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={killSwitch}
            disabled={saving}
            className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            title="Desliga para todo mundo na hora, sem confirmação"
          >
            <Power className="size-3.5" />
            Desligar agora
          </Button>
        )}
      </header>

      {isStale && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Pública há {publicForDays} dias. Flag de lançamento que vira permanente é dívida: hora de tirar
          a checagem do código e apagar a flag
        </div>
      )}

      {/* Escada de liberação: cada degrau inclui o anterior. */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FEATURE_FLAG_MODES.map((mode) => {
          const Icon = MODE_ICON[mode]
          const active = draft.mode === mode
          return (
            <button
              key={mode}
              type="button"
              data-active={active}
              onClick={() => setDraft((current) => ({ ...current, mode }))}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl bg-muted/40 p-3 text-left text-muted-foreground ring-1 ring-transparent transition hover:bg-muted",
                MODE_TONE[mode]
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="size-4" />
                {FEATURE_FLAG_MODE_META[mode].label}
              </span>
              <span className="text-[11px] leading-snug opacity-80">{FEATURE_FLAG_MODE_META[mode].hint}</span>
            </button>
          )
        })}
      </div>

      {draft.mode === "percentage" && (
        <div className="mt-4 space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Fatia dos membros logados</span>
            <span className="font-display text-2xl font-bold tabular-nums">{draft.rolloutPercent}%</span>
          </div>
          <Slider
            value={[draft.rolloutPercent]}
            min={0}
            max={100}
            step={1}
            onValueChange={([value]) => setDraft((current) => ({ ...current, rolloutPercent: value ?? 0 }))}
          />
          <div className="flex flex-wrap gap-1.5">
            {ROLLOUT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, rolloutPercent: preset }))}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-semibold transition",
                  draft.rolloutPercent === preset
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {preset}%
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A fatia é fixa por pessoa: subir de 10% para 25% só acrescenta gente, quem já via continua
            vendo. Cada flag sorteia a sua fatia, então não são sempre os mesmos membros servindo de cobaia
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Allowlist
          ids={draft.allowUserIds}
          users={knownUsers}
          disabled={draft.mode === "off" || draft.mode === "everyone"}
          onChange={(allowUserIds) => setDraft((current) => ({ ...current, allowUserIds }))}
          onLearnUser={(user) => setKnownUsers((current) => ({ ...current, [user.id]: user }))}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`note-${flagKey}`}>
            Nota (por que está assim)
          </label>
          <Textarea
            id={`note-${flagKey}`}
            value={draft.note ?? ""}
            maxLength={280}
            rows={3}
            placeholder="Ex.: liberando aos poucos, de olho no Discord"
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
          />
        </div>
      </div>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3">
        <div className="min-w-0 text-sm">
          <span className="text-muted-foreground">Quem vê: </span>
          <span className="font-semibold text-foreground">{audienceSummary(draft)}</span>
          {config.updatedAt && (
            <p className="text-[11px] text-muted-foreground">
              Última mudança {relativeTime(config.updatedAt)}
              {config.updatedBy && knownUsers[config.updatedBy] && <> por {knownUsers[config.updatedBy].name}</>}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
              Descartar
            </Button>
          )}
          <Button type="button" size="sm" onClick={requestSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      </footer>

      <GoPublicDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        flagKey={flagKey}
        saving={saving}
        onConfirm={() => save(draft)}
      />
    </section>
  )
}

type SearchProfile = { id: string; display_name: string | null }

function Allowlist({
  ids,
  users,
  disabled,
  onChange,
  onLearnUser,
}: {
  ids: string[]
  users: Record<string, AllowlistUser>
  disabled: boolean
  onChange: (ids: string[]) => void
  onLearnUser: (user: AllowlistUser) => void
}) {
  const [query, setQuery] = useState("")
  const debounced = useDebouncedValue(query.trim(), 300)
  // Resultado guardado junto do termo que o gerou: "carregando" é o termo
  // atual ainda não ter resposta, sem um estado a mais para sincronizar.
  const [fetched, setFetched] = useState<{ query: string; profiles: SearchProfile[] }>({ query: "", profiles: [] })
  const results = fetched.profiles
  const loading = debounced.length >= 2 && fetched.query !== debounced

  useEffect(() => {
    if (debounced.length < 2) return
    const controller = new AbortController()
    fetch(`/api/users/search?q=${encodeURIComponent(debounced)}&limit=6&forMention=1`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { profiles?: SearchProfile[] } | null) =>
        setFetched({ query: debounced, profiles: body?.profiles ?? [] })
      )
      .catch(() => {})
    return () => controller.abort()
  }, [debounced])

  const candidates = useMemo(
    () => (debounced.length < 2 ? [] : results.filter((profile) => !ids.includes(profile.id))),
    [debounced, results, ids]
  )

  return (
    <div className={cn("space-y-1.5", disabled && "opacity-50")}>
      <span className="text-xs font-medium text-muted-foreground">
        Testadores (veem em qualquer modo, menos Desligada)
      </span>

      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs">
              {users[id]?.name ?? "Carregando"}
              <button
                type="button"
                aria-label="Remover testador"
                onClick={() => onChange(ids.filter((current) => current !== id))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar membro pelo nome"
          className="h-9 pl-8"
        />
        {loading && debounced.length >= 2 && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {candidates.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {candidates.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => {
                    onLearnUser({ id: profile.id, name: profile.display_name || "Sem nome" })
                    onChange([...ids, profile.id])
                    setQuery("")
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <UserPlus className="size-3.5 text-muted-foreground" />
                  {profile.display_name || "Sem nome"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function GoPublicDialog({
  open,
  onOpenChange,
  flagKey,
  saving,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  flagKey: FeatureFlagKey
  saving: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* O conteúdo desmonta ao fechar, e o texto digitado vai junto. */}
      <DialogContent>
        <GoPublicForm flagKey={flagKey} saving={saving} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  )
}

function GoPublicForm({
  flagKey,
  saving,
  onCancel,
  onConfirm,
}: {
  flagKey: FeatureFlagKey
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-4 text-emerald-400" />
            Liberar para todo mundo?
          </DialogTitle>
          <DialogDescription>
            {FEATURE_FLAGS[flagKey].label} passa a aparecer para qualquer visitante, inclusive sem conta, e a
            Home é refeita na hora. Para confirmar, digite <code className="text-foreground">{flagKey}</code>
          </DialogDescription>
        </DialogHeader>
        <Input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={flagKey} autoFocus />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={typed !== flagKey || saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Liberar
          </Button>
        </DialogFooter>
    </>
  )
}

function describeChange(event: FeatureFlagEvent): string {
  const after = event.after
  const before = event.before
  if (!before) return `criou em ${FEATURE_FLAG_MODE_META[after.mode ?? "off"].label}`

  const parts: string[] = []
  if (before.mode !== after.mode) {
    parts.push(
      `${FEATURE_FLAG_MODE_META[before.mode ?? "off"].label} → ${FEATURE_FLAG_MODE_META[after.mode ?? "off"].label}`
    )
  }
  if (before.rollout_percent !== after.rollout_percent && after.mode === "percentage") {
    parts.push(`fatia ${before.rollout_percent ?? 0}% → ${after.rollout_percent ?? 0}%`)
  }
  const beforeTesters = before.allow_user_ids?.length ?? 0
  const afterTesters = after.allow_user_ids?.length ?? 0
  if (beforeTesters !== afterTesters) parts.push(`testadores ${beforeTesters} → ${afterTesters}`)
  if ((before.note ?? "") !== (after.note ?? "")) parts.push("nota editada")
  return parts.join(" · ") || "testadores trocados"
}

function AuditLog({ events }: { events: FeatureFlagEvent[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-muted-foreground" />
        Histórico
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma mudança registrada ainda</p>
      ) : (
        <ol className="space-y-2.5">
          {events.map((event) => {
            const Icon = MODE_ICON[event.after.mode ?? "off"]
            return (
              <li key={event.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-3.5 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{event.actorName ?? "Sistema"}</span>{" "}
                    <span className="text-muted-foreground">em</span>{" "}
                    <code className="text-xs">{event.flagKey}</code>
                    <span className="text-muted-foreground">: {describeChange(event)}</span>
                  </p>
                  {event.after.note && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">“{event.after.note}”</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70">{relativeTime(event.createdAt)}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
