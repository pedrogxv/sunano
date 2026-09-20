"use client"

import { Headphones, Keyboard, Monitor, Mouse, Square } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TierItemTooltipContent, type TierItemTooltipContentProps } from "@/components/tierlist/TierItemTooltipContent"
import {
  PeripheralMiniCard,
  PeripheralMiniCardEmpty,
  type MiniCardAuthor,
} from "@/components/profile/PeripheralMiniCard"
import Link from "next/link"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { mapTier } from "@/lib/tier-utils"
import type { SetupItem, SetupSlot } from "@/lib/profile-showcase"

const SLOT_META: Record<SetupSlot, { label: string; Icon: typeof Mouse }> = {
  mouse: { label: "Mouse", Icon: Mouse },
  keyboard: { label: "Teclado", Icon: Keyboard },
  headset: { label: "Fone / Headset", Icon: Headphones },
  monitor: { label: "Monitor", Icon: Monitor },
  mousepad: { label: "Mousepad", Icon: Square },
}

/** O slot "mousepad" aceita tanto mousepad quanto glasspad — o rótulo reflete o que foi escolhido. */
function getSlotLabel(item: SetupItem): string {
  if (item.slot === "mousepad" && item.peripheral?.category === "glasspad") return "Glasspad"
  return SLOT_META[item.slot].label
}

interface SetupGridProps {
  setup: SetupItem[]
  /** Dono do perfil — a foto que acompanha a nota dele no rodapé do card. */
  author: MiniCardAuthor
  /** Nota do dono por periférico (`profile.own_review_ratings`). */
  ownRatings: Record<string, number>
  /** Dono do perfil vê os slots vazios como convite para configurar. */
  isOwner?: boolean
}

/** Grid do "Meu Setup" — um card por periférico, sempre com os 5 slots. */
export function SetupGrid({ setup, author, ownRatings, isOwner = false }: SetupGridProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Meu setup
      </h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {setup.map((item) => (
          <SetupCard
            key={item.slot}
            item={item}
            author={author}
            ownRatings={ownRatings}
            isOwner={isOwner}
          />
        ))}
      </div>
    </section>
  )
}

function SetupCard({
  item,
  author,
  ownRatings,
  isOwner,
}: {
  item: SetupItem
  author: MiniCardAuthor
  ownRatings: Record<string, number>
  isOwner: boolean
}) {
  const { Icon } = SLOT_META[item.slot]
  const label = getSlotLabel(item)

  const header = (
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )

  if (!item.peripheral) {
    return (
      <PeripheralMiniCardEmpty
        header={header}
        icon={<Icon className="size-7" />}
        label={isOwner ? "Configurar" : "Não informado"}
      />
    )
  }

  const peripheral = item.peripheral
  const href = `/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`

  return (
    <Tooltip>
      {/* O wrapper existe para o Radix ter um nó DOM com ref: o card é um
          componente de função e `asChild` não consegue passar a ref nele. */}
      <TooltipTrigger asChild>
        <div className="h-full">
          <PeripheralMiniCard
            peripheral={peripheral}
            rating={ownRatings[peripheral.id] ?? null}
            author={author}
            header={header}
            className="h-full"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent
        className="rounded-xl border border-border bg-popover p-4 shadow-2xl backdrop-blur-md"
        sideOffset={12}
        side="bottom"
        align="center"
      >
        <Link href={href} aria-label={peripheral.name} className="block cursor-pointer hover:opacity-95">
          <TierItemTooltipContent
            name={peripheral.name}
            brand={peripheral.brand}
            categoryLabel={peripheral.category}
            image_url={peripheral.image_url}
            tier={peripheral.tier ? mapTier(peripheral.tier) : null}
            ratings={peripheral.ratings}
            tags={peripheral.tags as TierItemTooltipContentProps["tags"]}
          />
        </Link>
      </TooltipContent>
    </Tooltip>
  )
}
