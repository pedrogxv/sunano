import Image from "next/image"
import Link from "next/link"
import { Headphones, Keyboard, Monitor, Mouse, Square } from "lucide-react"

import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import type { SetupItem, SetupSlot } from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

const SLOT_META: Record<SetupSlot, { label: string; Icon: typeof Mouse }> = {
  mouse: { label: "Mouse", Icon: Mouse },
  keyboard: { label: "Teclado", Icon: Keyboard },
  headset: { label: "Fone / Headset", Icon: Headphones },
  monitor: { label: "Monitor", Icon: Monitor },
  mousepad: { label: "Mousepad", Icon: Square },
}

interface SetupGridProps {
  setup: SetupItem[]
  /** Dono do perfil vê os slots vazios como convite para configurar. */
  isOwner?: boolean
}

/** Grid do "Meu Setup" — um card por periférico, sempre com os 5 slots. */
export function SetupGrid({ setup, isOwner = false }: SetupGridProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Meu setup
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {setup.map((item) => (
          <SetupCard key={item.slot} item={item} isOwner={isOwner} />
        ))}
      </div>
    </section>
  )
}

function SetupCard({ item, isOwner }: { item: SetupItem; isOwner: boolean }) {
  const { label, Icon } = SLOT_META[item.slot]
  const title = item.peripheral?.name ?? null
  const isEmpty = !title

  const content = (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 transition-colors",
        isEmpty ? "border-dashed" : "hover:border-primary/40 hover:bg-card"
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </div>

      <div className="relative flex h-16 items-center justify-center">
        {item.peripheral?.image_url ? (
          <Image
            src={item.peripheral.image_url}
            alt={item.peripheral.name}
            fill
            sizes="160px"
            className="object-contain"
          />
        ) : (
          <Icon className={cn("size-8", isEmpty ? "text-muted-foreground/25" : "text-muted-foreground/60")} />
        )}
      </div>

      <p
        className={cn(
          "line-clamp-2 text-xs font-medium",
          isEmpty ? "text-muted-foreground/50" : "text-foreground"
        )}
      >
        {title ?? (isOwner ? "Configurar" : "Não informado")}
      </p>
    </div>
  )

  if (item.peripheral) {
    return (
      <Link href={`/perifericos/${buildPeripheralSlug(item.peripheral.name, item.peripheral.id)}`}>
        {content}
      </Link>
    )
  }

  return content
}
