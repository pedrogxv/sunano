"use client"

import { useState } from "react"
import Image from "next/image"
import {
  Award,
  ChevronDown,
  ChevronUp,
  Headphones,
  Keyboard,
  Monitor,
  Mouse,
  Pencil,
  Square,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { PeripheralPicker } from "./PeripheralPicker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  SETUP_SLOTS,
  type SetupItem,
  type SetupSlot,
  type ShowcaseMedal,
  type ShowcasePeripheral,
} from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

/** Categorias do catálogo aceitas por cada slot do setup. */
const SLOT_META: Record<
  SetupSlot,
  { label: string; Icon: typeof Mouse; categories: readonly string[] }
> = {
  mouse: { label: "Mouse", Icon: Mouse, categories: ["mouse"] },
  keyboard: { label: "Teclado", Icon: Keyboard, categories: ["keyboard"] },
  headset: { label: "Fone / Headset", Icon: Headphones, categories: ["headset", "iem"] },
  monitor: { label: "Monitor", Icon: Monitor, categories: ["monitors"] },
  mousepad: { label: "Mousepad", Icon: Square, categories: ["mousepad", "glasspad"] },
}

/* ─────────────────────────── Setup ─────────────────────────── */

export function SetupEditor({
  setup,
  onChange,
}: {
  setup: SetupItem[]
  onChange: (slot: SetupSlot, peripheral: ShowcasePeripheral | null) => void
}) {
  const [editing, setEditing] = useState<SetupSlot | null>(null)

  return (
    <Card className="border-border bg-card/90">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Meu setup</CardTitle>
        <CardDescription>
          Escolha um periférico do catálogo em cada slot. Se o seu ainda não está na wiki, peça o
          cadastro no fórum.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-6">
        {SETUP_SLOTS.map((slot) => {
          const item = setup.find((i) => i.slot === slot) ?? { slot, peripheral: null }
          const { label: slotLabel, Icon, categories } = SLOT_META[slot]
          // O slot "mousepad" aceita mousepad e glasspad — o rótulo reflete o que foi escolhido.
          const label = slot === "mousepad" && item.peripheral?.category === "glasspad" ? "Glasspad" : slotLabel
          const isEditing = editing === slot
          const filled = item.peripheral?.name ?? null

          return (
            <div key={slot} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/40">
                  {item.peripheral?.image_url ? (
                    <div className="relative size-7">
                      <Image
                        src={item.peripheral.image_url}
                        alt={item.peripheral.name}
                        fill
                        sizes="28px"
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <Icon className="size-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p
                    className={cn(
                      "truncate text-sm",
                      filled ? "font-medium text-foreground" : "text-muted-foreground/50"
                    )}
                  >
                    {filled ?? "Vazio"}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(isEditing ? null : slot)}
                  >
                    {isEditing ? <X className="size-4" /> : <Pencil className="size-4" />}
                  </Button>
                  {filled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(slot, null)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <PeripheralPicker
                    categories={categories}
                    autoFocus
                    placeholder={`Buscar ${label.toLowerCase()}...`}
                    onSelect={(peripheral) => {
                      onChange(slot, peripheral)
                      setEditing(null)
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground/60">
                    Só periféricos já cadastrados na wiki podem ir para a vitrine.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── Favoritos ───────────────────────── */

export function FavoritosEditor({
  favorites,
  limit,
  tierLabel,
  onChange,
}: {
  favorites: ShowcasePeripheral[]
  limit: number
  tierLabel: string
  onChange: (favorites: ShowcasePeripheral[]) => void
}) {
  const isFull = favorites.length >= limit

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= favorites.length) return
    const next = [...favorites]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <Card className="border-border bg-card/90">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Periféricos favoritos</CardTitle>
        <CardDescription>
          Seu plano ({tierLabel}) exibe até {limit} favoritos. A ordem aqui é a ordem do perfil.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-6">
        {favorites.length > 0 && (
          <ul className="space-y-2">
            {favorites.map((peripheral, index) => (
              <li
                key={peripheral.id}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5"
              >
                <div className="relative size-9 shrink-0">
                  {peripheral.image_url ? (
                    <Image
                      src={peripheral.image_url}
                      alt={peripheral.name}
                      fill
                      sizes="36px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="size-full rounded bg-muted/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{peripheral.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{peripheral.brand}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === favorites.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(favorites.filter((f) => f.id !== peripheral.id))}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {isFull ? (
          <p className="rounded-lg border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground/60">
            Limite de {limit} favoritos atingido. Remova um para adicionar outro.
          </p>
        ) : (
          <PeripheralPicker
            excludeIds={favorites.map((f) => f.id)}
            placeholder="Buscar periférico para favoritar..."
            onSelect={(peripheral) => onChange([...favorites, peripheral])}
          />
        )}

        <p className="text-right text-[11px] text-muted-foreground/60">
          {favorites.length} de {limit}
        </p>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── Medalhas ────────────────────────── */

export function MedalhasEditor({
  medals,
  pinnedIds,
  limit,
  onChange,
}: {
  medals: ShowcaseMedal[]
  pinnedIds: string[]
  limit: number
  onChange: (ids: string[]) => void
}) {
  function toggle(medalId: string) {
    if (pinnedIds.includes(medalId)) {
      onChange(pinnedIds.filter((id) => id !== medalId))
      return
    }
    if (pinnedIds.length >= limit) {
      toast.error(`Você pode destacar no máximo ${limit} medalhas.`)
      return
    }
    onChange([...pinnedIds, medalId])
  }

  return (
    <Card className="border-border bg-card/90">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Medalhas em destaque</CardTitle>
        <CardDescription>
          Escolha até {limit} medalhas para exibir no perfil. Se não escolher nenhuma, as mais
          recentes aparecem automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-6">
        {medals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground/60">
            Você ainda não conquistou medalhas.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {medals.map((medal) => {
                const position = pinnedIds.indexOf(medal.id)
                const isPinned = position !== -1
                return (
                  <li key={medal.id}>
                    <button
                      type="button"
                      onClick={() => toggle(medal.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                        isPinned
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:bg-muted/30"
                      )}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/40">
                        {medal.icon_url ? (
                          <Image
                            src={medal.icon_url}
                            alt={medal.name}
                            width={28}
                            height={28}
                            className="size-7 object-contain"
                          />
                        ) : (
                          <Award className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{medal.name}</p>
                        {medal.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {medal.description}
                          </p>
                        )}
                      </div>
                      {isPinned && (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {position + 1}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            <p className="text-right text-[11px] text-muted-foreground/60">
              {pinnedIds.length} de {limit} destacadas · {medals.length} conquistadas
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
