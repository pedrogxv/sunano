"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { ArrowBigDown, ArrowBigUp, SmilePlus } from "lucide-react"
import { toast } from "sonner"

import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  CHANGELOG_REACTIONS,
  EMPTY_FEEDBACK,
  type ChangelogEntryFeedback,
  type ChangelogReaction,
  type ChangelogVote,
} from "@/lib/changelog-feedback"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

/*
 * Voto e reações das Patch Notes.
 *
 * - Otimista: o número muda no clique; a resposta do servidor só confirma
 *   (e traz o que outras pessoas fizeram no meio-tempo).
 * - Estado, não toggle: o cliente manda "quero ↑" e não "inverte". Clique
 *   duplo e retry de rede não desfazem o voto.
 * - Rajada de cliques vira UMA requisição: cada controle espera 300ms parado
 *   antes de mandar o estado final.
 * - Erro volta ao último estado confirmado e avisa; 401 abre o login.
 * - Uma leitura para a página inteira (todas as versões), feita uma vez e
 *   refeita quando a pessoa entra ou sai da conta.
 */

const SEND_DELAY_MS = 300

type FeedbackContextValue = {
  ready: boolean
  get: (entryId: string) => ChangelogEntryFeedback
  vote: (entryId: string, next: ChangelogVote) => void
  react: (entryId: string, reaction: ChangelogReaction, active: boolean) => void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

function useFeedback() {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error("ChangelogFeedback fora do ChangelogFeedbackProvider")
  return value
}

function applyVote(f: ChangelogEntryFeedback, next: ChangelogVote): ChangelogEntryFeedback {
  let { up, down } = f
  if (f.myVote === 1) up -= 1
  if (f.myVote === -1) down -= 1
  if (next === 1) up += 1
  if (next === -1) down += 1
  return { ...f, up: Math.max(0, up), down: Math.max(0, down), myVote: next }
}

function applyReaction(f: ChangelogEntryFeedback, reaction: ChangelogReaction, active: boolean): ChangelogEntryFeedback {
  const has = f.myReactions.includes(reaction)
  if (has === active) return f
  const count = (f.reactions[reaction] ?? 0) + (active ? 1 : -1)
  return {
    ...f,
    reactions: { ...f.reactions, [reaction]: Math.max(0, count) },
    myReactions: active ? [...f.myReactions, reaction] : f.myReactions.filter((r) => r !== reaction),
  }
}

export function ChangelogFeedbackProvider({
  keyById,
  children,
}: {
  /** Âncora da versão (`v0-5-0`) → chave do banco (`changelogFeedbackKeys`). */
  keyById: Map<string, string>
  children: React.ReactNode
}) {
  const ui = useT().changelog.ui.feedback
  const { user, loading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const userId = user?.id ?? null

  const [data, setData] = useState<Record<string, ChangelogEntryFeedback>>({})
  const [ready, setReady] = useState(false)
  const dataRef = useRef(data)
  const confirmed = useRef<Record<string, ChangelogEntryFeedback>>({})
  // Mudanças locais por versão: resposta que chega depois de um clique mais
  // novo não pode sobrescrever o otimista dele.
  const edits = useRef(new Map<string, number>())
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (loading) return
    const controller = new AbortController()
    fetch("/api/changelog/feedback", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { entries: Record<string, ChangelogEntryFeedback> } | null) => {
        if (!json) return
        confirmed.current = json.entries
        setData(json.entries)
        setReady(true)
      })
      .catch(() => {
        // Sem contagem a página continua legível; os controles só não mostram números.
      })
    return () => controller.abort()
  }, [userId, loading])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const get = useCallback(
    (entryId: string) => {
      const key = keyById.get(entryId)
      return (key && data[key]) || EMPTY_FEEDBACK
    },
    [data, keyById]
  )

  const requireUser = useCallback(
    (entryId: string) => {
      if (userId) return true
      if (!loading) openLogin(`/changelog#${entryId}`)
      return false
    },
    [userId, loading, openLogin]
  )

  const send = useCallback(
    (entryId: string, key: string, slot: string, body: () => Record<string, unknown>) => {
      const previous = timers.current.get(slot)
      if (previous) window.clearTimeout(previous)
      timers.current.set(
        slot,
        window.setTimeout(async () => {
          timers.current.delete(slot)
          const editAtSend = edits.current.get(key)
          try {
            const res = await fetch("/api/changelog/feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entry: key, ...body() }),
            })
            if (res.status === 401) {
              openLogin(`/changelog#${entryId}`)
              throw new Error("unauthenticated")
            }
            if (!res.ok) throw new Error(String(res.status))
            const json = (await res.json()) as { feedback: ChangelogEntryFeedback }
            confirmed.current = { ...confirmed.current, [key]: json.feedback }
            if (edits.current.get(key) === editAtSend) {
              setData((prev) => ({ ...prev, [key]: json.feedback }))
            }
          } catch (error) {
            if ((error as Error).message !== "unauthenticated") toast.error(ui.error)
            setData((prev) => ({ ...prev, [key]: confirmed.current[key] ?? EMPTY_FEEDBACK }))
          }
        }, SEND_DELAY_MS)
      )
    },
    [openLogin, ui.error]
  )

  const mutate = useCallback(
    (entryId: string, change: (f: ChangelogEntryFeedback) => ChangelogEntryFeedback) => {
      const key = keyById.get(entryId)
      if (!key) return null
      edits.current.set(key, (edits.current.get(key) ?? 0) + 1)
      const next = change(dataRef.current[key] ?? EMPTY_FEEDBACK)
      dataRef.current = { ...dataRef.current, [key]: next }
      setData(dataRef.current)
      return key
    },
    [keyById]
  )

  const vote = useCallback(
    (entryId: string, next: ChangelogVote) => {
      if (!requireUser(entryId)) return
      const key = mutate(entryId, (f) => applyVote(f, next))
      if (!key) return
      send(entryId, key, `${key}:vote`, () => ({ vote: dataRef.current[key]?.myVote ?? 0 }))
    },
    [requireUser, mutate, send]
  )

  const react = useCallback(
    (entryId: string, reaction: ChangelogReaction, active: boolean) => {
      if (!requireUser(entryId)) return
      const key = mutate(entryId, (f) => applyReaction(f, reaction, active))
      if (!key) return
      send(entryId, key, `${key}:${reaction}`, () => ({
        reaction,
        active: dataRef.current[key]?.myReactions.includes(reaction) ?? false,
      }))
    },
    [requireUser, mutate, send]
  )

  const value = useMemo(() => ({ ready, get, vote, react }), [ready, get, vote, react])
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>
}

/** Número que rola para cima ou para baixo quando muda, como um placar. */
function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [prev, setPrev] = useState(value)
  const [direction, setDirection] = useState<"up" | "down">("up")
  if (prev !== value) {
    setDirection(value > prev ? "up" : "down")
    setPrev(value)
  }
  return (
    <span className={cn("inline-flex overflow-hidden", className)}>
      <span
        key={value}
        className={cn(
          "inline-block motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
          direction === "up" ? "motion-safe:slide-in-from-bottom-2" : "motion-safe:slide-in-from-top-2"
        )}
      >
        {value}
      </span>
    </span>
  )
}

function HintTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** ▲ saldo ▼, estilo fórum: um voto por pessoa, clicar de novo tira. */
export function ChangelogVote({ entryId, size = "md" }: { entryId: string; size?: "sm" | "md" }) {
  const ui = useT().changelog.ui.feedback
  const { ready, get, vote } = useFeedback()
  const f = get(entryId)
  const score = f.up - f.down
  const [bump, setBump] = useState<{ dir: ChangelogVote; n: number }>({ dir: 0, n: 0 })

  function press(dir: 1 | -1) {
    const next: ChangelogVote = f.myVote === dir ? 0 : dir
    if (next !== 0) setBump((b) => ({ dir: next, n: b.n + 1 }))
    vote(entryId, next)
  }

  const iconSize = size === "sm" ? "size-4" : "size-5"
  const buttonSize = size === "sm" ? "size-7" : "size-9"

  return (
    <div
      role="group"
      aria-label={ui.question}
      className="inline-flex items-center gap-0.5 rounded-full bg-secondary/70 p-1 ring-1 ring-foreground/[0.06]"
    >
      <HintTooltip label={`${ui.voteUp} · ${f.up}`}>
        <button
          type="button"
          onClick={() => press(1)}
          aria-pressed={f.myVote === 1}
          aria-label={`${ui.voteUp} (${f.up})`}
          className={cn(
            "flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
            buttonSize,
            f.myVote === 1
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
          )}
        >
          <ArrowBigUp
            key={bump.dir === 1 ? bump.n : "up"}
            className={cn(iconSize, f.myVote === 1 && "fill-current", bump.dir === 1 && bump.n > 0 && "feedback-pop")}
          />
        </button>
      </HintTooltip>

      <span
        aria-label={`${ui.score}: ${score}`}
        className={cn(
          "min-w-7 px-0.5 text-center font-bold tabular-nums transition-colors",
          size === "sm" ? "text-xs" : "text-sm",
          f.myVote === 1 ? "text-emerald-400" : f.myVote === -1 ? "text-rose-400" : "text-foreground",
          !ready && "opacity-0"
        )}
      >
        <RollingNumber value={score} />
      </span>

      <HintTooltip label={`${ui.voteDown} · ${f.down}`}>
        <button
          type="button"
          onClick={() => press(-1)}
          aria-pressed={f.myVote === -1}
          aria-label={`${ui.voteDown} (${f.down})`}
          className={cn(
            "flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60",
            buttonSize,
            f.myVote === -1
              ? "bg-rose-500/15 text-rose-400"
              : "text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
          )}
        >
          <ArrowBigDown
            key={bump.dir === -1 ? bump.n : "down"}
            className={cn(iconSize, f.myVote === -1 && "fill-current", bump.dir === -1 && bump.n > 0 && "feedback-pop")}
          />
        </button>
      </HintTooltip>
    </div>
  )
}

function ReactionChip({
  reaction,
  emoji,
  count,
  active,
  ready,
  label,
  onToggle,
}: {
  reaction: ChangelogReaction
  emoji: string
  count: number
  active: boolean
  ready: boolean
  label: string
  onToggle: (reaction: ChangelogReaction, active: boolean) => void
}) {
  // Cada ativação remonta o emoji (pulo) e solta uma cópia que sobe e some.
  const [bursts, setBursts] = useState(0)
  return (
    <HintTooltip label={label}>
      <button
        type="button"
        onClick={() => {
          if (!active) setBursts((n) => n + 1)
          onToggle(reaction, !active)
        }}
        aria-pressed={active}
        aria-label={`${label}: ${count}`}
        className={cn(
          "relative inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm ring-1 transition-[background-color,box-shadow,transform] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70",
          active
            ? "bg-violet-500/15 ring-violet-400/50"
            : "bg-secondary/60 ring-foreground/[0.06] hover:bg-secondary hover:ring-foreground/15"
        )}
      >
        <span aria-hidden key={bursts} className={cn("text-base leading-none", bursts > 0 && "feedback-pop")}>
          {emoji}
        </span>
        {bursts > 0 && (
          <span aria-hidden key={`float-${bursts}`} className="feedback-float text-base leading-none">
            {emoji}
          </span>
        )}
        {count > 0 && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              active ? "text-violet-200" : "text-muted-foreground",
              !ready && "opacity-0"
            )}
          >
            <RollingNumber value={count} />
          </span>
        )}
      </button>
    </HintTooltip>
  )
}

/**
 * Reações da versão. `full` mostra as seis sempre (convite, na versão mais
 * recente); `compact` só as que alguém já usou, mais o botão de adicionar.
 */
export function ChangelogReactions({ entryId, variant }: { entryId: string; variant: "full" | "compact" }) {
  const ui = useT().changelog.ui.feedback
  const { ready, get, react } = useFeedback()
  const f = get(entryId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hovered, setHovered] = useState<ChangelogReaction | null>(null)

  const shown = CHANGELOG_REACTIONS.filter(
    (r) => variant === "full" || (f.reactions[r.key] ?? 0) > 0 || f.myReactions.includes(r.key)
  )

  const toggle = (reaction: ChangelogReaction, active: boolean) => react(entryId, reaction, active)

  return (
    <div role="group" aria-label={ui.reactionsLabel} className="flex flex-wrap items-center gap-1.5">
      {shown.map((r) => (
        <ReactionChip
          key={r.key}
          reaction={r.key}
          emoji={r.emoji}
          count={f.reactions[r.key] ?? 0}
          active={f.myReactions.includes(r.key)}
          ready={ready}
          label={ui.reactions[r.key]}
          onToggle={toggle}
        />
      ))}

      {variant === "compact" && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={ui.addReaction}
              className="inline-flex size-8 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground ring-1 ring-foreground/[0.06] transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
            >
              <SmilePlus className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-auto rounded-2xl p-2">
            <div className="flex gap-1" onMouseLeave={() => setHovered(null)}>
              {CHANGELOG_REACTIONS.map((r) => {
                const active = f.myReactions.includes(r.key)
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={active}
                    aria-label={ui.reactions[r.key]}
                    onMouseEnter={() => setHovered(r.key)}
                    onFocus={() => setHovered(r.key)}
                    onClick={() => {
                      toggle(r.key, !active)
                      setPickerOpen(false)
                    }}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl text-xl transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none motion-reduce:hover:scale-100",
                      active && "bg-violet-500/15"
                    )}
                  >
                    {r.emoji}
                  </button>
                )
              })}
            </div>
            {/* Nome da reação sob o cursor, sem esperar tooltip */}
            <p aria-hidden className="h-5 pt-1 text-center text-xs text-muted-foreground">
              {hovered ? ui.reactions[hovered] : ui.addReaction}
            </p>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
