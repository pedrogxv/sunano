"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ElementType } from "react"
import Image from "next/image"
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Dices,
  Gauge,
  Link2,
  Mouse,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"
import { markChangelogBannerSeen } from "@/components/layout/ChangelogBanner"
import {
  AURA_BRAND_BG_CLASS,
  AURA_BRAND_COLOR_CLASS,
  AURA_BRAND_FILL_CLASS,
  AuraFlameIcon,
} from "@/components/ui/AuraIcon"
import {
  CHANGELOG_AREAS,
  matchesSearch,
  normalizeChangelogEntries,
  splitByMatch,
  type ChangelogArea,
  type ChangelogEntryData,
  type NormalizedChangelogEntry,
} from "@/lib/changelog"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

/**
 * Patch Notes (`/changelog`): a versão mais nova em destaque, com as mudanças
 * em abas por área, e o histórico inteiro numa linha do tempo sanfonada.
 *
 * Tudo continua no HTML (as entradas recolhidas só ficam com altura zero),
 * então a página segue indexável inteira mesmo com a sanfona fechada.
 *
 * O "Novo pra você" é por navegador: guarda a última versão vista e marca as
 * que chegaram depois. Sem storage, a página só não mostra o selo.
 */

const LAST_SEEN_KEY = "sunano:patch-notes-last-seen"

/**
 * A versão vista ANTES desta visita, lida uma vez por carregamento: a página
 * grava a versão atual logo ao abrir, e reler o storage depois apagaria os
 * selos que ela acabou de calcular.
 */
let lastSeenAtLoad: string | null | undefined
function readLastSeenAtLoad(): string | null {
  if (lastSeenAtLoad === undefined) {
    try {
      lastSeenAtLoad = window.localStorage.getItem(LAST_SEEN_KEY)
    } catch {
      lastSeenAtLoad = null
    }
  }
  return lastSeenAtLoad
}

const noopSubscribe = () => () => {}

const MASCOT = {
  head: "/images/mascot/mascot-448.webp",
  empty: "/images/mascot/guide/warning.webp",
} as const

type AreaStyle = {
  icon: ElementType
  /** Cor do ícone/rótulo. */
  text: string
  /** Fundo suave do ícone e da aba ativa. */
  soft: string
  /** Bolinha do marcador da lista. */
  dot: string
  /** Contorno da aba ativa e do card de destaque no hover. */
  ring: string
  /** Brilho do card de destaque. */
  glow: string
}

// Cada área com cor E símbolo próprios. A da Aura usa os tokens da moeda
// (nunca o literal) e a chama central, como manda o AGENTS.md.
const AREA_STYLE: Record<ChangelogArea, AreaStyle> = {
  loja: {
    icon: ShoppingBag,
    text: "text-emerald-400",
    soft: "bg-emerald-500/10",
    dot: "bg-emerald-400",
    ring: "ring-emerald-500/40",
    glow: "from-emerald-500/20",
  },
  pedidos: {
    icon: Package,
    text: "text-cyan-400",
    soft: "bg-cyan-500/10",
    dot: "bg-cyan-400",
    ring: "ring-cyan-500/40",
    glow: "from-cyan-500/20",
  },
  perifericos: {
    icon: Mouse,
    text: "text-blue-400",
    soft: "bg-blue-500/10",
    dot: "bg-blue-400",
    ring: "ring-blue-500/40",
    glow: "from-blue-500/20",
  },
  perfil: {
    icon: UserRound,
    text: "text-violet-400",
    soft: "bg-violet-500/10",
    dot: "bg-violet-400",
    ring: "ring-violet-500/40",
    glow: "from-violet-500/20",
  },
  aura: {
    icon: AuraFlameIcon,
    text: AURA_BRAND_COLOR_CLASS,
    soft: AURA_BRAND_BG_CLASS,
    dot: AURA_BRAND_FILL_CLASS,
    ring: "ring-orange-500/40",
    glow: "from-orange-500/20",
  },
  seguranca: {
    icon: ShieldCheck,
    text: "text-rose-400",
    soft: "bg-rose-500/10",
    dot: "bg-rose-400",
    ring: "ring-rose-500/40",
    glow: "from-rose-500/20",
  },
  desempenho: {
    icon: Gauge,
    text: "text-lime-400",
    soft: "bg-lime-500/10",
    dot: "bg-lime-400",
    ring: "ring-lime-500/40",
    glow: "from-lime-500/20",
  },
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))
}

type PatchNotesUi = ReturnType<typeof useT>["changelog"]["ui"]

function useUi(): PatchNotesUi {
  return useT().changelog.ui
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function PatchNotes({
  title,
  description,
  entries: rawEntries,
}: {
  title: string
  description: string
  entries: ChangelogEntryData[]
}) {
  const entries = useMemo(() => normalizeChangelogEntries(rawEntries), [rawEntries])
  const [latest, ...older] = entries

  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(older[0] ? [older[0].id] : []))
  const [flashId, setFlashId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const totalChanges = useMemo(() => entries.reduce((sum, e) => sum + e.changes.length, 0), [entries])
  const specialEditions = useMemo(() => entries.filter((e) => e.codename).length, [entries])

  // "Novo pra você": tudo que chegou depois da última versão vista neste
  // navegador. No servidor (e na hidratação) não há nada visto: o selo só
  // aparece no cliente, sem divergir do HTML.
  const lastSeen = useSyncExternalStore(noopSubscribe, readLastSeenAtLoad, () => null)
  const newIds = useMemo(() => {
    const seenIndex = lastSeen ? entries.findIndex((e) => e.version === lastSeen) : -1
    return new Set(seenIndex > 0 ? entries.slice(0, seenIndex).map((e) => e.id) : [])
  }, [entries, lastSeen])

  useEffect(() => {
    if (!latest) return
    try {
      localStorage.setItem(LAST_SEEN_KEY, latest.version)
    } catch {
      // Storage bloqueado: segue sem o selo.
    }
    markChangelogBannerSeen(latest.version)
  }, [latest])

  const focusEntry = useCallback((id: string) => {
    setQuery("")
    setExpanded((current) => new Set(current).add(id))
    setFlashId(id)
    // Espera a sanfona abrir (e a busca sumir) antes de rolar.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    })
    window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1800)
  }, [])

  // Link compartilhado (`/changelog#v0-3-7`) abre direto na versão.
  useEffect(() => {
    function openFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (id && entries.some((e) => e.id === id)) focusEntry(id)
    }
    openFromHash()
    window.addEventListener("hashchange", openFromHash)
    return () => window.removeEventListener("hashchange", openFromHash)
  }, [entries, focusEntry])

  // "/" foca a busca, como em qualquer lista de documentação.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function surpriseMe() {
    if (older.length === 0) return
    const pick = older[Math.floor(Math.random() * older.length)]
    focusEntry(pick.id)
  }

  if (!latest) return null

  const searching = query.trim().length > 0

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-8 sm:py-12">
      <Hero
        title={title}
        description={description}
        latest={latest}
        stats={{ versions: entries.length, changes: totalChanges, specialEditions }}
        query={query}
        setQuery={setQuery}
        searchRef={searchRef}
        onSurprise={surpriseMe}
        constellation={older.slice(0, 6).map((e) => e.label)}
      />

      {searching ? (
        <SearchResults entries={entries} query={query} setQuery={setQuery} onOpen={focusEntry} />
      ) : (
        <>
          <LatestRelease entry={latest} isNew={newIds.has(latest.id)} />
          {older.length > 0 && (
            <Timeline
              entries={older}
              expanded={expanded}
              setExpanded={setExpanded}
              flashId={flashId}
              newIds={newIds}
              onJump={focusEntry}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ────────────────────────────── Abertura ────────────────────────────── */

function Hero({
  title,
  description,
  latest,
  stats,
  query,
  setQuery,
  searchRef,
  onSurprise,
  constellation,
}: {
  title: string
  description: string
  latest: NormalizedChangelogEntry
  stats: { versions: number; changes: number; specialEditions: number }
  query: string
  setQuery: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  onSurprise: () => void
  constellation: string[]
}) {
  const ui = useUi()
  return (
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500/[0.14] via-sky-500/[0.05] to-background p-6 ring-1 ring-foreground/[0.07] sm:p-10">
      {/* As versões anteriores flutuando ao fundo: o histórico "atrás" da novidade */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 lg:block">
        {constellation.map((label, i) => (
          <span
            key={label}
            className="aura-guide-float absolute rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-foreground/25"
            style={{
              top: `${12 + ((i * 29) % 70)}%`,
              left: `${8 + ((i * 37) % 55)}%`,
              animationDelay: `${i * -0.7}s`,
              animationDuration: `${4.5 + (i % 3)}s`,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="relative grid items-center gap-4 sm:gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">
            <Sparkles className="size-3.5" />
            Patch Notes
          </p>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">{description}</p>

          <dl className="flex flex-wrap gap-2">
            {[
              { value: stats.versions, label: ui.statVersions },
              { value: stats.changes, label: ui.statChanges },
              { value: stats.specialEditions, label: ui.statSpecialEditions },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-background/50 px-4 py-2.5 backdrop-blur-sm">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="flex items-baseline gap-1.5">
                  <AnimatedCounter value={stat.value} duration={1600} className="font-display text-xl font-black" />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="group relative flex min-w-0 flex-1 items-center">
              <span className="sr-only">{ui.searchLabel}</span>
              <Search className="pointer-events-none absolute left-3.5 z-[1] size-4 text-muted-foreground transition-colors group-focus-within:text-violet-300" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("")
                }}
                placeholder={ui.searchPlaceholder}
                className="h-11 w-full rounded-xl bg-background/70 pl-10 pr-16 text-sm ring-1 ring-foreground/10 backdrop-blur-sm transition-shadow placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/60 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={ui.clearSearch}
                  className="absolute right-2 flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 hidden rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </label>
            <button
              type="button"
              onClick={onSurprise}
              className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-secondary/70 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <Dices className="size-4 text-violet-300 transition-transform duration-500 group-hover:rotate-[200deg] motion-reduce:transition-none" />
              {ui.surprise}
            </button>
          </div>
        </div>

        {/* A calopsita anuncia a versão nova */}
        <a href={`#${latest.id}`} className="group relative order-first mx-auto block size-28 sm:size-52 md:order-none" aria-label={fill(ui.goToVersion, { version: latest.label })}>
          <span aria-hidden className="absolute inset-4 rounded-full bg-violet-500/25 blur-3xl motion-safe:animate-pulse" />
          <Image
            src={MASCOT.head}
            alt=""
            width={448}
            height={448}
            priority
            className="aura-guide-float relative size-full object-contain drop-shadow-[0_12px_30px_rgba(139,92,246,0.3)]"
          />
          <span className="absolute -right-1 top-1 rotate-6 rounded-xl bg-background/85 px-3 py-1.5 text-center shadow-lg shadow-violet-950/40 ring-1 ring-violet-400/30 backdrop-blur transition-transform group-hover:rotate-0 group-hover:scale-105">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-violet-300">{ui.newVersionBadge}</span>
            <span className="block font-display text-lg font-black leading-none tabular-nums">{latest.label}</span>
          </span>
        </a>
      </div>
    </header>
  )
}

/* ────────────────────────────── Peças comuns ────────────────────────────── */

function Highlighted({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>
  return (
    <>
      {splitByMatch(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-violet-400/25 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

function CopyLinkButton({ id, label }: { id: string; label: string }) {
  const ui = useUi()
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = `${window.location.origin}${window.location.pathname}#${id}`
    window.history.replaceState(null, "", `#${id}`)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Sem permissão de clipboard: o link já está na barra de endereço.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? ui.linkCopied : fill(ui.copyLinkOf, { version: label })}
      title={copied ? ui.linkCopied : ui.copyLink}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        copied ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
    </button>
  )
}

function NewForYouPill() {
  const ui = useUi()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      {ui.newForYou}
    </span>
  )
}

function ChangeItem({
  text,
  area,
  query,
  index = 0,
}: {
  text: string
  area: ChangelogArea | null
  query?: string
  index?: number
}) {
  return (
    <li
      className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both md:text-[15px]"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <span
        aria-hidden
        className={cn("mt-2 size-1.5 shrink-0 rounded-full", area ? AREA_STYLE[area].dot : "bg-muted-foreground/50")}
      />
      <span className="min-w-0">
        <Highlighted text={text} query={query} />
      </span>
    </li>
  )
}

/* ────────────────────────────── Versão mais recente ────────────────────────────── */

type AreaFilter = ChangelogArea | "all"

function LatestRelease({ entry, isNew }: { entry: NormalizedChangelogEntry; isNew: boolean }) {
  const ui = useUi()
  const [area, setArea] = useState<AreaFilter>("all")
  const tabsRef = useRef<HTMLDivElement>(null)

  const areaCounts = useMemo(() => {
    const counts = new Map<ChangelogArea, number>()
    for (const change of entry.changes) {
      if (change.area) counts.set(change.area, (counts.get(change.area) ?? 0) + 1)
    }
    return CHANGELOG_AREAS.filter((a) => counts.has(a)).map((a) => ({ area: a, count: counts.get(a)! }))
  }, [entry])

  const hasAreas = areaCounts.length > 0
  const visible = area === "all" ? entry.changes : entry.changes.filter((c) => c.area === area)

  function pickArea(next: ChangelogArea) {
    setArea(next)
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  return (
    <section id={entry.id} aria-labelledby={`${entry.id}-title`} className="scroll-mt-28 space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            {ui.latest}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">{entry.label}</span>
          {entry.codename && (
            <span className="font-display text-sm font-semibold italic text-violet-300">{entry.codename}</span>
          )}
          <span className="text-xs text-muted-foreground">{entry.date}</span>
          {isNew && <NewForYouPill />}
          <span className="ml-auto">
            <CopyLinkButton id={entry.id} label={entry.label} />
          </span>
        </div>
        <h2 id={`${entry.id}-title`} className="max-w-4xl font-display text-2xl font-black leading-tight text-foreground sm:text-4xl">
          {entry.title}
        </h2>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{entry.description}</p>
      </div>

      {entry.highlights && entry.highlights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {entry.highlights.map((highlight, i) => {
            const style = AREA_STYLE[highlight.area]
            const Icon = style.icon
            const count = areaCounts.find((a) => a.area === highlight.area)?.count ?? 0
            return (
              <button
                key={highlight.title}
                type="button"
                onClick={() => pickArea(highlight.area)}
                className={cn(
                  "group relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-secondary/40 p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:bg-secondary/70 hover:ring-1 motion-reduce:hover:translate-y-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both",
                  style.ring
                )}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity group-hover:opacity-100",
                    style.glow
                  )}
                />
                <span className={cn("relative flex size-10 items-center justify-center rounded-xl", style.soft, style.text)}>
                  <Icon className="size-5 transition-transform duration-300 group-hover:scale-110" />
                </span>
                <span className="relative space-y-1">
                  <span className="block font-display text-base font-bold leading-snug text-foreground">{highlight.title}</span>
                  <span className="block text-sm leading-relaxed text-muted-foreground">{highlight.body}</span>
                </span>
                {count > 0 && (
                  <span className={cn("relative mt-auto inline-flex items-center gap-1 text-xs font-semibold", style.text)}>
                    {fill(ui.viewChanges, { count: plural(count, ui.change, ui.changes) })}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/[0.07] sm:p-7">
        {hasAreas && (
          <div
            ref={tabsRef}
            role="tablist"
            aria-label={ui.areaTabsLabel}
            className="-mx-1 -mt-1 mb-5 flex scroll-mt-28 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none]"
          >
            <AreaTab active={area === "all"} onClick={() => setArea("all")} label={ui.all} count={entry.changes.length} />
            {areaCounts.map(({ area: a, count }) => (
              <AreaTab key={a} area={a} active={area === a} onClick={() => setArea(a)} label={ui.areas[a]} count={count} />
            ))}
          </div>
        )}

        <div role={hasAreas ? "tabpanel" : undefined} key={area}>
          {area === "all" && hasAreas ? (
            <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
              {areaCounts.map(({ area: a }) => {
                const style = AREA_STYLE[a]
                const Icon = style.icon
                return (
                  <div key={a} className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setArea(a)}
                      className={cn("flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-80", style.text)}
                    >
                      <span className={cn("flex size-6 items-center justify-center rounded-lg", style.soft)}>
                        <Icon className="size-3.5" />
                      </span>
                      {ui.areas[a]}
                    </button>
                    <ul className="space-y-2">
                      {entry.changes
                        .filter((c) => c.area === a)
                        .map((change, i) => (
                          <ChangeItem key={change.text} text={change.text} area={change.area} index={i} />
                        ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((change, i) => (
                <ChangeItem key={change.text} text={change.text} area={change.area} index={i} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function AreaTab({
  area,
  active,
  onClick,
  label,
  count,
}: {
  area?: ChangelogArea
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  const style = area ? AREA_STYLE[area] : null
  const Icon = style?.icon ?? Sparkles
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
        active
          ? cn("text-foreground ring-1", style ? cn(style.soft, style.ring) : "bg-violet-500/15 ring-violet-500/40")
          : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      <Icon className={cn("size-3.5", active ? (style?.text ?? "text-violet-300") : "")} />
      {label}
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}

/* ────────────────────────────── Linha do tempo ────────────────────────────── */

function Timeline({
  entries,
  expanded,
  setExpanded,
  flashId,
  newIds,
  onJump,
}: {
  entries: NormalizedChangelogEntry[]
  expanded: Set<string>
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>
  flashId: string | null
  newIds: Set<string>
  onJump: (id: string) => void
}) {
  const ui = useUi()
  const [activeId, setActiveId] = useState<string | null>(entries[0]?.id ?? null)
  const listRef = useRef<HTMLDivElement>(null)
  const allOpen = expanded.size >= entries.length

  // Trilho acompanha a leitura: a versão que cruza o terço de cima da tela acende.
  useEffect(() => {
    const root = listRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.filter((r) => r.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: "-25% 0px -65% 0px" }
    )
    root.querySelectorAll("[data-patch-entry]").forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [entries])

  const months = useMemo(() => {
    const groups: { month: string; entries: NormalizedChangelogEntry[] }[] = []
    for (const entry of entries) {
      const last = groups.at(-1)
      if (last && last.month === entry.month) last.entries.push(entry)
      else groups.push({ month: entry.month, entries: [entry] })
    }
    return groups
  }, [entries])

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section aria-labelledby="patch-history-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{ui.historyEyebrow}</p>
          <h2 id="patch-history-title" className="font-display text-2xl font-black text-foreground sm:text-3xl">
            {ui.historyTitle}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(entries.map((e) => e.id)))}
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {allOpen ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
          {allOpen ? ui.collapseAll : ui.expandAll}
        </button>
      </div>

      <div className="grid gap-10 lg:grid-cols-[170px_1fr]">
        {/* Trilho de versões, agrupado por mês (desktop) */}
        <nav aria-label={ui.versionsNav} className="hidden lg:block">
          <div className="sticky top-[calc(var(--sticky-header-h,4rem)+1.5rem)] max-h-[calc(100vh-var(--sticky-header-h,4rem)-3rem)] space-y-5 overflow-y-auto pr-2 [scrollbar-width:thin]">
            {months.map((group) => (
              <div key={group.month} className="space-y-1">
                <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                  {capitalize(group.month)}
                </p>
                {group.entries.map((entry) => {
                  const active = entry.id === activeId
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onJump(entry.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs tabular-nums transition-colors",
                        active ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full transition-all",
                          active ? "scale-125 bg-violet-400" : newIds.has(entry.id) ? "bg-violet-400/60" : "bg-muted-foreground/30"
                        )}
                      />
                      <span className="truncate">{entry.label}</span>
                      {entry.codename && <Sparkles aria-hidden className="ml-auto size-3 shrink-0 text-violet-300/70" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </nav>

        <div ref={listRef} className="relative">
          <span aria-hidden className="absolute bottom-4 left-[15px] top-4 w-px bg-gradient-to-b from-border via-border to-transparent" />
          <ol className="space-y-3">
            {entries.map((entry) => (
              <TimelineEntry
                key={entry.id}
                entry={entry}
                open={expanded.has(entry.id)}
                onToggle={() => toggle(entry.id)}
                flash={flashId === entry.id}
                isNew={newIds.has(entry.id)}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function TimelineEntry({
  entry,
  open,
  onToggle,
  flash,
  isNew,
}: {
  entry: NormalizedChangelogEntry
  open: boolean
  onToggle: () => void
  flash: boolean
  isNew: boolean
}) {
  const ui = useUi()
  const panelId = `${entry.id}-panel`
  return (
    <li id={entry.id} data-patch-entry className="relative scroll-mt-28 pl-10">
      <span
        aria-hidden
        className={cn(
          "absolute left-[9px] top-5 size-[13px] rounded-full ring-4 ring-background transition-colors",
          open ? (entry.codename ? "bg-violet-400" : "bg-foreground/80") : "bg-muted-foreground/35"
        )}
      />
      <article
        className={cn(
          "rounded-2xl transition-all duration-500",
          open ? "bg-secondary/40" : "hover:bg-secondary/25",
          flash && "bg-violet-500/10 ring-2 ring-violet-400/50"
        )}
      >
        <div className="flex items-start gap-2 p-4 pr-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="group flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-md bg-background/70 px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">
                  {entry.label}
                </span>
                {entry.codename && (
                  <span className="font-display text-xs font-semibold italic text-violet-300">{entry.codename}</span>
                )}
                <span className="text-xs text-muted-foreground">{entry.date}</span>
                {entry.changes.length > 0 && (
                  <span className="text-xs text-muted-foreground/70">· {plural(entry.changes.length, ui.change, ui.changes)}</span>
                )}
                {isNew && <NewForYouPill />}
              </span>
              <span className="block font-display text-base font-bold leading-snug text-foreground sm:text-lg">
                {entry.title}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:text-foreground",
                open && "rotate-180"
              )}
            />
          </button>
          <CopyLinkButton id={entry.id} label={entry.label} />
        </div>

        {/* Sanfona por grid-rows: anima a altura real e mantém o texto no HTML */}
        <div
          id={panelId}
          inert={!open}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 px-4 pb-5">
              <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">{entry.description}</p>
              {entry.changes.length > 0 && (
                <ul className="space-y-2">
                  {entry.changes.map((change) => (
                    <ChangeItem key={change.text} text={change.text} area={change.area} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </article>
    </li>
  )
}

/* ────────────────────────────── Busca ────────────────────────────── */

function SearchResults({
  entries,
  query,
  setQuery,
  onOpen,
}: {
  entries: NormalizedChangelogEntry[]
  query: string
  setQuery: (q: string) => void
  onOpen: (id: string) => void
}) {
  const ui = useUi()
  const results = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          titleMatch: matchesSearch(entry.title, query) || matchesSearch(entry.description, query),
          changes: entry.changes.filter((c) => matchesSearch(c.text, query)),
        }))
        .filter((r) => r.titleMatch || r.changes.length > 0),
    [entries, query]
  )
  const hits = results.reduce((sum, r) => sum + Math.max(r.changes.length, r.titleMatch ? 1 : 0), 0)

  if (results.length === 0) {
    return (
      <section className="flex flex-col items-center gap-4 py-10 text-center" aria-live="polite">
        <Image src={MASCOT.empty} alt="" width={160} height={160} className="aura-guide-float size-32 object-contain" />
        <div className="space-y-1">
          <p className="font-display text-xl font-bold text-foreground">{fill(ui.noResults, { query: query.trim() })}</p>
          <p className="text-sm text-muted-foreground">{ui.noResultsHint}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {ui.searchSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="rounded-full bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        {fill(ui.resultsFor, {
          results: plural(hits, ui.result, ui.results),
          versions: plural(results.length, ui.version, ui.versions),
          query: query.trim(),
        })}
      </p>
      <ol className="space-y-3">
        {results.map(({ entry, changes }) => (
          <li key={entry.id} className="rounded-2xl bg-secondary/40 p-5 motion-safe:animate-in motion-safe:fade-in-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-background/70 px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">{entry.label}</span>
              {entry.codename && <span className="font-display text-xs font-semibold italic text-violet-300">{entry.codename}</span>}
              <span className="text-xs text-muted-foreground">{entry.date}</span>
              <button
                type="button"
                onClick={() => onOpen(entry.id)}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-violet-300 transition-colors hover:text-violet-200"
              >
                {ui.openVersion}
                <ArrowRight className="size-3.5" />
              </button>
            </div>
            <p className="font-display text-base font-bold leading-snug text-foreground">
              <Highlighted text={entry.title} query={query} />
            </p>
            {changes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {changes.map((change) => (
                  <ChangeItem key={change.text} text={change.text} area={change.area} query={query} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
