import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Tag } from "lucide-react"

import { buildPeripheralDisplayName } from "@/lib/peripheral-slug"
import { TIER_BASE_COLORS } from "@/lib/tierlist-theme"
import type { MentionedPeripheral } from "@/lib/server/repositories/forum-peripherals-repository"

/**
 * Chips dos periféricos citados, abaixo do corpo do post.
 *
 * Server Component de propósito: são `<Link>` renderizados no HTML servido
 * (a página do post é SSR com `revalidate = 120`), então o Googlebot lê o
 * link fórum -> ficha sem executar JS. Esse é o ponto da feature — se
 * dependesse de hidratação, o valor de interlinking se perderia.
 */
export function PeripheralMentionChips({ peripherals }: { peripherals: MentionedPeripheral[] }) {
  if (peripherals.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Tag className="size-3 shrink-0" />
        Citados
      </span>
      {peripherals.map((peripheral) => (
        <Link
          key={peripheral.id}
          href={`/perifericos/${peripheral.slug}`}
          title={`Ver ficha de ${buildPeripheralDisplayName(peripheral.brand, peripheral.name)}`}
          className="group/chip flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 py-0.5 pl-1 pr-2 text-xs font-medium text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-secondary hover:text-primary hover:shadow-[0_2px_10px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {peripheral.image_url ? (
            <Image
              src={peripheral.image_url}
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0 rounded-full object-cover transition-transform duration-200 group-hover/chip:scale-110"
            />
          ) : (
            <span className="size-5 shrink-0 rounded-full bg-muted" />
          )}
          <span className="max-w-[200px] truncate">
            {buildPeripheralDisplayName(peripheral.brand, peripheral.name)}
          </span>
          {peripheral.tier && (
            <span
              className="shrink-0 rounded px-1 py-px text-[9px] font-bold text-white"
              style={{
                backgroundColor:
                  TIER_BASE_COLORS[peripheral.tier as keyof typeof TIER_BASE_COLORS] ?? "#6B7280",
              }}
            >
              {peripheral.tier}
            </span>
          )}
          {/* Seta só no hover: dá o sinal de "isto leva a algum lugar" sem
              poluir a linha de chips no estado de repouso. */}
          <ChevronRight className="size-3 shrink-0 -ml-0.5 max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/chip:ml-0 group-hover/chip:max-w-3 group-hover/chip:opacity-100" />
        </Link>
      ))}
    </div>
  )
}
