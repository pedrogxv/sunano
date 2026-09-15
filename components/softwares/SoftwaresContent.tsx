"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AppWindow, Crown, Flame, GripVertical, Heart } from "lucide-react"
import { toast } from "sonner"

import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { SoftwareCard, type SoftwareCardProps } from "@/components/softwares/SoftwareCard"
import { Button } from "@/components/ui/button"
import { TIER_CAPABILITIES } from "@/lib/account-tier"
import { compareSoftwareNames, type Software, type SoftwareFavoritesState } from "@/lib/softwares"
import { cn } from "@/lib/utils"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"

type Tab = "all" | "favorites"

const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"

const LOGIN_NEXT = "/softwares"

/**
 * Favoritos amarrados ao usuário que os pediu: trocar de conta com a página
 * aberta não herda a lista anterior. `state: null` = a busca falhou.
 */
type OwnedFavorites = { userId: string; state: SoftwareFavoritesState | null }

export function SoftwaresContent({
  softwares,
  mostUsedIds,
}: {
  softwares: Software[]
  mostUsedIds: string[]
}) {
  const { user, pending: authPending } = useAuthUser()
  const { openLogin } = useAuthModal()
  const userId = user?.id ?? null

  const [tab, setTab] = useState<Tab>("all")
  const [owned, setOwned] = useState<OwnedFavorites | null>(null)
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)
  const inFlight = useRef(new Set<string>())

  // A página é estática (CDN). O único dado por usuário é este GET leve.
  useEffect(() => {
    if (!userId) return
    let active = true
    fetch("/api/softwares/favorites", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<SoftwareFavoritesState>) : null))
      .then((data) => {
        if (active) setOwned({ userId, state: data?.authenticated ? data : null })
      })
      .catch(() => {
        if (active) setOwned({ userId, state: null })
      })
    return () => {
      active = false
    }
  }, [userId])

  const favoritesSettled = owned !== null && owned.userId === userId
  const favorites = favoritesSettled ? owned.state : null
  const favoritesReady = !authPending && (!userId || favorites !== null)

  const byId = useMemo(() => new Map(softwares.map((software) => [software.id, software])), [softwares])
  const favoriteIds = favorites?.ids
  const favoriteSet = useMemo(() => new Set(favoriteIds ?? []), [favoriteIds])

  const mostUsed = useMemo(
    () => mostUsedIds.flatMap((id) => byId.get(id) ?? []),
    [mostUsedIds, byId]
  )

  // VIP vê na ordem que escolheu; conta comum, em ordem alfabética.
  const canReorder = favorites?.canReorder ?? false
  const favoriteSoftwares = useMemo(() => {
    const list = (favoriteIds ?? []).flatMap((id) => byId.get(id) ?? [])
    return canReorder ? list : list.sort(compareSoftwareNames)
  }, [favoriteIds, canReorder, byId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function setFavoriteIds(update: (ids: string[]) => string[]) {
    setOwned((prev) =>
      prev?.state ? { ...prev, state: { ...prev.state, ids: update(prev.state.ids) } } : prev
    )
  }

  function notifyLimit(state: SoftwareFavoritesState) {
    toast.error(`Limite de ${state.limit} favoritos`, {
      description: state.isVip
        ? "Remova um favorito para marcar outro."
        : `Remova um favorito ou seja VIP para favoritar até ${TIER_CAPABILITIES.vip.maxFavoriteSoftwares} e escolher a ordem.`,
    })
  }

  async function toggleFavorite(software: Software) {
    if (!userId) {
      openLogin(LOGIN_NEXT)
      return
    }
    if (!favorites || inFlight.current.has(software.id)) return

    const wasFavorite = favoriteSet.has(software.id)
    if (!wasFavorite && favorites.ids.length >= favorites.limit) {
      notifyLimit(favorites)
      return
    }

    const apply = (favorite: boolean) =>
      setFavoriteIds((ids) =>
        favorite
          ? ids.includes(software.id) ? ids : [...ids, software.id]
          : ids.filter((id) => id !== software.id)
      )

    inFlight.current.add(software.id)
    apply(!wasFavorite)
    try {
      const res = await fetch(`/api/softwares/${software.id}/favorite`, {
        method: wasFavorite ? "DELETE" : "POST",
      })
      if (res.status === 401) {
        apply(wasFavorite)
        openLogin(LOGIN_NEXT)
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        apply(wasFavorite)
        toast.error(wasFavorite ? "Não foi possível remover" : "Não foi possível favoritar", {
          description: data?.error,
        })
      }
    } catch {
      apply(wasFavorite)
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      inFlight.current.delete(software.id)
    }
  }

  // Beacon não segura a navegação e sobrevive à troca de aba.
  function trackOpen(software: Software) {
    const url = `/api/softwares/${software.id}/click`
    try {
      if (navigator.sendBeacon?.(url)) return
    } catch {
      // cai no fetch abaixo
    }
    fetch(url, { method: "POST", keepalive: true }).catch(() => {})
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!favorites || !over || active.id === over.id) return

    const visible = favoriteSoftwares.map((software) => software.id)
    const from = visible.indexOf(String(active.id))
    const to = visible.indexOf(String(over.id))
    if (from === -1 || to === -1) return

    // Favorito que ainda não está na lista em cache da página (card criado há
    // poucos minutos) não aparece, mas segue na conta: vai para o fim.
    const hidden = favorites.ids.filter((id) => !byId.has(id))
    const next = [...arrayMove(visible, from, to), ...hidden]
    const previous = favorites.ids
    setFavoriteIds(() => next)

    try {
      const res = await fetch("/api/softwares/favorites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Não foi possível salvar a ordem.")
      }
    } catch (err) {
      setFavoriteIds(() => previous)
      toast.error("Não foi possível reordenar", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const cardProps = (software: Software): SoftwareCardProps => ({
    software,
    favorited: favoriteSet.has(software.id),
    favoriteReady: favoritesReady,
    onToggleFavorite: (target) => void toggleFavorite(target),
    onOpen: trackOpen,
  })

  return (
    <div className="mx-auto max-w-6xl px-2 py-6 sm:px-4 md:px-6 md:py-8">
      <header className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">Softwares</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Todos os WebSoftwares em um só lugar</p>

        <div
          role="tablist"
          aria-label="Filtrar softwares"
          className="mt-5 inline-flex rounded-full border border-border bg-muted/40 p-1"
        >
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            Todos
          </TabButton>
          <TabButton active={tab === "favorites"} onClick={() => setTab("favorites")}>
            Favoritos
            {favorites && (
              <span className="text-[11px] font-medium tabular-nums opacity-70">
                {favorites.ids.length}/{favorites.limit}
              </span>
            )}
          </TabButton>
        </div>
      </header>

      {tab === "all" ? (
        softwares.length === 0 ? (
          <EmptyState
            icon={AppWindow}
            title="Nenhum software por aqui ainda"
            description="Os WebSoftwares das marcas aparecem aqui assim que forem cadastrados."
          />
        ) : (
          <>
            {mostUsed.length > 0 && (
              <section className="mt-8">
                <SectionTitle icon={Flame} iconClassName="text-orange-500">
                  Mais usados
                </SectionTitle>
                <div className={GRID_CLASS}>
                  {mostUsed.map((software) => (
                    <SoftwareCard key={software.id} {...cardProps(software)} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-8">
              {mostUsed.length > 0 && <SectionTitle icon={AppWindow}>Todos</SectionTitle>}
              <div className={GRID_CLASS}>
                {softwares.map((software) => (
                  <SoftwareCard key={software.id} {...cardProps(software)} />
                ))}
              </div>
            </section>
          </>
        )
      ) : !userId && !authPending ? (
        <EmptyState
          icon={Heart}
          title="Entre para favoritar"
          description="Guarde os softwares que você mais usa e encontre todos aqui."
          action={<Button onClick={() => openLogin(LOGIN_NEXT)}>Entrar</Button>}
        />
      ) : favoritesSettled && !favorites ? (
        <EmptyState
          icon={Heart}
          title="Não foi possível carregar seus favoritos"
          description="Recarregue a página para tentar de novo."
        />
      ) : !favorites ? (
        <div className={cn(GRID_CLASS, "mt-8")}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="aspect-[6/7] animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
            <span className="tabular-nums">
              {favorites.ids.length} de {favorites.limit} favoritos
            </span>
            <span aria-hidden>·</span>
            {favorites.canReorder ? (
              <span className="inline-flex items-center gap-1">
                <GripVertical className="size-3.5" />
                Arraste pela alça para mudar a ordem
              </span>
            ) : (
              <>
                <span>
                  Em ordem alfabética. VIP favorita até {TIER_CAPABILITIES.vip.maxFavoriteSoftwares} e escolhe a
                  ordem.
                </span>
                {!favorites.isVip && isVipSubscriptionEnabled() && (
                  <button
                    type="button"
                    onClick={() => setVipUpsellOpen(true)}
                    className="inline-flex items-center gap-1 font-semibold hover:underline"
                    style={{ color: "var(--vip-accent)" }}
                  >
                    <Crown className="size-3.5" />
                    Seja VIP
                  </button>
                )}
              </>
            )}
          </div>

          {favoriteSoftwares.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Nenhum favorito ainda"
              description="Toque no coração de um software para guardar ele aqui."
              className="mt-0"
            />
          ) : favorites.canReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <SortableContext items={favoriteSoftwares.map((software) => software.id)} strategy={rectSortingStrategy}>
                <div className={GRID_CLASS}>
                  {favoriteSoftwares.map((software) => (
                    <SortableSoftwareCard key={software.id} {...cardProps(software)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className={GRID_CLASS}>
              {favoriteSoftwares.map((software) => (
                <SoftwareCard key={software.id} {...cardProps(software)} />
              ))}
            </div>
          )}
        </section>
      )}

      <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </div>
  )
}

function SortableSoftwareCard(props: SoftwareCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.software.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <SoftwareCard
        {...props}
        className={cn(isDragging && "shadow-lg ring-1 ring-primary/40")}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Mover ${props.software.name}`}
            className="flex size-7 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-5 py-1.5 text-sm font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function SectionTitle({
  icon: Icon,
  iconClassName,
  children,
}: {
  icon: React.ElementType
  iconClassName?: string
  children: React.ReactNode
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className={cn("size-4", iconClassName)} />
      {children}
    </h2>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mt-8 flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      <Icon className="size-6 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
