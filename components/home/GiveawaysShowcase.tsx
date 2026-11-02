"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, Clock, Eye, Loader2, Package, PartyPopper, Plus, Trophy, Users } from "lucide-react"
import { toast } from "sonner"

import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { PrizeLaneHeader } from "@/components/aura/PrizeLaneHeader"
import { RouteLink } from "@/components/ui/route-link"
import {
  GIVEAWAY_JOIN_MESSAGES,
  GIVEAWAY_RARITIES,
  GIVEAWAY_RARITY_META,
  giveawayCategoryLabel,
  type GiveawayJoinCode,
  type PublicGiveaway,
  type ViewerGiveaways,
} from "@/lib/giveaways"
import { useFeatureFlag } from "@/lib/hooks/use-feature-flag"
import { storageImgProps } from "@/lib/storage-thumb"
import { cn } from "@/lib/utils"

interface GiveawaysShowcaseProps {
  /**
   * O que veio pronto do servidor. Na Home (ISR, igual para todo visitante)
   * só vem com a flag `giveaways` em "Todos"; nos outros modos é `null` e
   * quem a flag libera busca a própria visão no cliente por `/api/giveaways`.
   */
  initial: ViewerGiveaways | null
  /**
   * O servidor já avaliou a flag e as participações PARA QUEM ESTÁ VENDO
   * (página dinâmica, como a Central de Aura). Aí não há o que buscar: o
   * `null` em `initial` quer dizer "não liberado" e a seção chega no HTML.
   */
  resolvedForViewer?: boolean
  /**
   * `section`: seção própria com título grande (Home). `lane`: faixa dentro do
   * painel de Prêmios da Central de Aura, ao lado do Resgate com Aura.
   */
  variant?: "section" | "lane"
}

type GiveawaysResponse = { giveaways: PublicGiveaway[]; joinedIds: string[] }

/**
 * Seção 🎉 Sorteios (Home e Central de Aura), atrás da feature flag
 * `giveaways` (/admin/feature-flags). Três raridades, cada uma com a sua cor:
 * Raro (azul), Especial (vermelho) e Lendário (amarelo).
 */
export function GiveawaysShowcase({
  initial,
  resolvedForViewer = false,
  variant = "section",
}: GiveawaysShowcaseProps) {
  const { user } = useAuthUser()
  const { openLogin } = useAuthModal()
  const enabledForMe = useFeatureFlag("giveaways")

  const [giveaways, setGiveaways] = useState<PublicGiveaway[] | null>(initial?.giveaways ?? null)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(() => new Set(initial?.joinedIds ?? []))
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [burstId, setBurstId] = useState<string | null>(null)

  const userId = user?.id ?? null
  const shouldFetch = !resolvedForViewer && Boolean(userId) && enabledForMe

  useEffect(() => {
    if (!shouldFetch) return
    const controller = new AbortController()
    fetch("/api/giveaways", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<GiveawaysResponse>) : null))
      .then((data) => {
        if (!data) return
        setGiveaways(data.giveaways)
        setJoinedIds(new Set(data.joinedIds))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [shouldFetch])

  const join = useCallback(
    async (giveaway: PublicGiveaway) => {
      if (!user) {
        openLogin(window.location.pathname)
        return
      }
      setJoiningId(giveaway.id)
      try {
        const res = await fetch(`/api/giveaways/${giveaway.id}/join`, { method: "POST" })
        const data = (await res.json().catch(() => null)) as {
          code?: GiveawayJoinCode
          entriesCount?: number | null
          error?: string
        } | null
        const code = data?.code

        if (typeof data?.entriesCount === "number") {
          const entriesCount = data.entriesCount
          setGiveaways((current) =>
            current?.map((item) => (item.id === giveaway.id ? { ...item, entriesCount } : item)) ?? current
          )
        }
        if (code === "joined" || code === "already") {
          setJoinedIds((current) => new Set(current).add(giveaway.id))
        }
        if (code === "joined") {
          setBurstId(giveaway.id)
          window.setTimeout(() => setBurstId((current) => (current === giveaway.id ? null : current)), 1000)
          toast.success("Você está no sorteio!", { description: giveaway.title })
        } else if (code && code !== "already") {
          toast.error(GIVEAWAY_JOIN_MESSAGES[code])
        } else if (!code) {
          toast.error(data?.error ?? "Não foi possível participar")
        }
      } catch {
        toast.error("Sem conexão. Tente de novo")
      } finally {
        setJoiningId(null)
      }
    },
    [user, openLogin]
  )

  const visible = resolvedForViewer ? initial !== null : initial !== null || enabledForMe
  if (!visible) return null
  // Liberado mas ainda buscando: o esqueleto segura o espaço, em vez de a
  // seção surgir do nada e empurrar o resto da página.
  if (giveaways === null) return <GiveawaysSkeleton />

  // Seção liberada só para um grupo (WEB Master, equipe, gradual): o WEB Master
  // vê o aviso, para não tomar a prévia pelo lançamento.
  const isPreview = !initial?.isPublic && Boolean(user?.isWebMaster)

  if (giveaways.length === 0 && !isPreview) return null

  const previewBadge = isPreview && (
    <RouteLink
      href="/admin/feature-flags"
      className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      title="A seção está atrás da feature flag `giveaways`"
    >
      <Eye className="size-3" />
      Prévia
    </RouteLink>
  )

  const header =
    variant === "lane" ? (
      <PrizeLaneHeader
        icon={<PartyPopper className="size-4" />}
        iconClassName="bg-gradient-to-br from-amber-300 to-rose-500 text-[#1a0d00] shadow-[0_0_16px_-4px] shadow-rose-500/70"
        title="Sorteios"
        tag="Grátis"
        tagClassName="bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
        right={
          <>
            {previewBadge}
            <RarityLegend />
          </>
        }
      />
    ) : (
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="text-xl leading-none md:text-2xl">
              🎉
            </span>
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Sorteios</h2>
            {previewBadge}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            Entre de graça e concorra a periférico de verdade
          </p>
        </div>
        <RarityLegend />
      </div>
    )

  return (
    <section className={variant === "lane" ? "space-y-3" : "space-y-4"}>
      {header}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {giveaways.map((giveaway) => (
          <GiveawayCard
            key={giveaway.id}
            giveaway={giveaway}
            joined={joinedIds.has(giveaway.id)}
            joining={joiningId === giveaway.id}
            burst={burstId === giveaway.id}
            onJoin={() => join(giveaway)}
          />
        ))}
        {giveaways.length === 0 && (
          <RouteLink
            href="/admin/sorteios"
            className="flex h-[92px] items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="size-5" />
            Nenhum sorteio no ar
            <span className="font-semibold">Criar o primeiro</span>
          </RouteLink>
        )}
      </div>
    </section>
  )
}

/** Legenda das raridades: ponto aceso na cor + nome, em vez de três pílulas de texto. */
function RarityLegend() {
  return (
    <ul className="flex items-center gap-3" aria-label="Raridades">
      {GIVEAWAY_RARITIES.map((rarity) => (
        <li
          key={rarity}
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide",
            GIVEAWAY_RARITY_META[rarity].themeClass,
            GIVEAWAY_RARITY_META[rarity].textClass
          )}
        >
          <span aria-hidden className="giveaway-rarity-dot" />
          {GIVEAWAY_RARITY_META[rarity].label}
        </li>
      ))}
    </ul>
  )
}

function GiveawaysSkeleton() {
  return (
    <section aria-busy="true" aria-label="Carregando sorteios">
      <div className="mb-4 h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[92px] animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    </section>
  )
}

function timeLeftLabel(endsAt: string, now: number): string | null {
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return "termina em minutos"
  if (hours < 48) return `termina em ${hours}h`
  return `termina em ${Math.floor(hours / 24)}d`
}

/** Pedaços do confete: direção espalhada em leque, cor alternando entre a da raridade e o branco. */
const CONFETTI = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2
  const distance = 38 + (index % 3) * 12
  return {
    dx: `${Math.round(Math.cos(angle) * distance)}px`,
    dy: `${Math.round(Math.sin(angle) * distance - 18)}px`,
    rot: `${(index % 2 ? 1 : -1) * (160 + index * 25)}deg`,
    color: index % 3 === 0 ? "oklch(0.98 0 0)" : undefined,
  }
})

export function GiveawayCard({
  giveaway,
  joined,
  joining,
  burst,
  onJoin,
}: {
  giveaway: PublicGiveaway
  joined: boolean
  joining: boolean
  burst: boolean
  onJoin: () => void
}) {
  // Relógio fixado na montagem: o card não precisa virar "Encerrado" ao vivo
  // (a rota recusa a participação de qualquer forma), e ler a hora a cada
  // render tornaria o resultado instável.
  const [now] = useState(Date.now)
  const meta = GIVEAWAY_RARITY_META[giveaway.rarity]
  const full = giveaway.entriesCount >= giveaway.maxParticipants
  const expired = giveaway.endsAt !== null && new Date(giveaway.endsAt).getTime() <= now
  const closed = giveaway.status !== "open" || expired
  const percent = Math.min(100, Math.round((giveaway.entriesCount / giveaway.maxParticipants) * 100))
  const almostFull = !full && !closed && percent >= 90
  const timeLeft = !closed && giveaway.endsAt ? timeLeftLabel(giveaway.endsAt, now) : null

  const title = (
    <h3 className="line-clamp-1 text-[13px] font-semibold leading-tight text-foreground" title={giveaway.title}>
      {giveaway.title}
    </h3>
  )

  // Bilhete de rifa: foto à esquerda, picote, e o canhoto com categoria,
  // nome, contador e o botão em três linhas. O card vertical tinha a foto
  // quadrada em cima de tudo e passava de 300px de altura.
  return (
    <article className={cn("giveaway-card flex", meta.themeClass)}>
      <div className="giveaway-image relative w-24 shrink-0 overflow-hidden rounded-l-[0.8rem] bg-[var(--card-image-bg)] sm:w-28">
        {giveaway.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...storageImgProps(giveaway.imageUrl, 128)}
            alt={giveaway.title}
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 size-full object-contain p-2 transition-transform duration-500 hover:scale-105",
              closed && giveaway.status !== "drawn" && "opacity-50 grayscale"
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Package className="size-8" strokeWidth={1.25} />
          </div>
        )}
      </div>

      <div className="giveaway-perforation" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 pl-2 pr-2.5">
        {/* Categoria + raridade (o "GLASSPAD" do rascunho); à direita, o que
            pede pressa: tempo restante ou últimas vagas. */}
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-[10px] font-extrabold uppercase tracking-[0.12em]", meta.textClass)}>
            {giveawayCategoryLabel(giveaway.category)}
          </span>
          <span className={cn("shrink-0 rounded-full px-1.5 text-[8.5px] font-bold uppercase leading-4", meta.chipClass)}>
            {meta.label}
          </span>
          {(almostFull || timeLeft) && (
            <span
              suppressHydrationWarning
              className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
            >
              {almostFull ? (
                <span className="font-semibold text-foreground">Últimas vagas</span>
              ) : (
                <>
                  <Clock className="size-2.5" />
                  {timeLeft}
                </>
              )}
            </span>
          )}
        </div>

        {giveaway.peripheralHref ? (
          <Link href={giveaway.peripheralHref} className="hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}

        <div className="mt-auto flex items-end gap-2.5 pt-1">
          {giveaway.status === "drawn" && giveaway.winnerName ? (
            <p className="flex min-w-0 flex-1 items-center gap-1 text-[11px]">
              <Trophy className={cn("size-3.5 shrink-0", meta.textClass)} />
              <span className="truncate">
                <span className="text-muted-foreground">Ganhou </span>
                <span className="font-semibold text-foreground">{giveaway.winnerName}</span>
              </span>
            </p>
          ) : (
            // Contador de participantes (o "0/300" do rascunho).
            <div className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                <Users className="size-3" />
                <span className="font-display font-bold tabular-nums text-foreground">
                  {giveaway.entriesCount.toLocaleString("pt-BR")}
                </span>
                /{giveaway.maxParticipants.toLocaleString("pt-BR")}
              </span>
              <div
                className="h-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={giveaway.maxParticipants}
                aria-valuenow={giveaway.entriesCount}
                aria-label="Participantes"
              >
                <div className="giveaway-progress h-full rounded-full" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}

          <JoinButton
            joined={joined}
            joining={joining}
            burst={burst}
            full={full}
            closed={closed}
            drawn={giveaway.status === "drawn"}
            onJoin={onJoin}
          />
        </div>
      </div>
    </article>
  )
}

function JoinButton({
  joined,
  joining,
  burst,
  full,
  closed,
  drawn,
  onJoin,
}: {
  joined: boolean
  joining: boolean
  burst: boolean
  full: boolean
  closed: boolean
  drawn: boolean
  onJoin: () => void
}) {
  const base = "relative flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-bold"

  if (joined) {
    return (
      <div className={cn(base, "bg-muted text-foreground")}>
        <Check className="size-3" />
        {drawn ? "Participou" : "Dentro"}
        {burst &&
          CONFETTI.map((piece, index) => (
            <span
              key={index}
              aria-hidden
              className="giveaway-confetti"
              style={
                {
                  "--dx": piece.dx,
                  "--dy": piece.dy,
                  "--rot": piece.rot,
                  ...(piece.color ? { "--confetti-color": piece.color } : {}),
                } as React.CSSProperties
              }
            />
          ))}
      </div>
    )
  }

  if (drawn || closed || full) {
    return (
      <div className={cn(base, "bg-muted/60 text-muted-foreground")}>
        {drawn ? "Sorteado" : full ? "Esgotado" : "Encerrado"}
      </div>
    )
  }

  return (
    <button type="button" onClick={onJoin} disabled={joining} className={cn(base, "giveaway-cta transition")}>
      {joining ? <Loader2 className="size-3 animate-spin" /> : "Participar"}
    </button>
  )
}
