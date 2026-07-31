import Image from "next/image"
import { Award } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MEDAL_RARITY_BAR, MEDAL_RARITY_GLOW, MEDAL_RARITY_STYLES } from "@/lib/profile-showcase"
import type { EventDisplay } from "@/lib/events"
import { cn } from "@/lib/utils"

export function EventCard({ event }: { event: EventDisplay }) {
  const percent = Math.min(100, Math.round((event.currentCount / event.maxParticipants) * 100))

  return (
    <div
      className={cn("relative w-64", event.active && "event-card-glow")}
      style={{ "--glow-color": MEDAL_RARITY_GLOW[event.rarity] } as React.CSSProperties}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex cursor-help flex-col items-center gap-3 rounded-2xl border-2 bg-card p-5 text-center transition-transform hover:-translate-y-1",
              MEDAL_RARITY_STYLES[event.rarity],
              !event.active && "grayscale-[0.4] opacity-70"
            )}
          >
            {!event.active && (
              <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Encerrado
              </span>
            )}

            <div className="flex size-20 items-center justify-center">
              {event.imageUrl ? (
                <Image
                  src={event.imageUrl}
                  alt={event.name}
                  width={64}
                  height={64}
                  className="size-16 object-contain"
                />
              ) : (
                <Award className="size-14" />
              )}
            </div>

            <p className="font-semibold text-foreground">{event.name}</p>

            <div className="w-full space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn("h-full rounded-full transition-all", MEDAL_RARITY_BAR[event.rarity])}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {event.currentCount} / {event.maxParticipants}
              </p>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[220px] text-xs">{event.description ?? event.name}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
