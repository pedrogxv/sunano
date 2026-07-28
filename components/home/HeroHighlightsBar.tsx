import Link from "next/link"
import { Package, ShoppingBag } from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"

/**
 * Faixa compacta exibida logo abaixo do carrossel de banners.
 *
 * Existe para que trocar o hero por banners não custe os dois CTAs principais
 * (Tierlist / Loja) nem os números de prova social que o bloco antigo trazia —
 * quando há banner ativo, o `DefaultHero` sai de cena e levaria tudo junto.
 */
export default function HeroHighlightsBar({
  counts,
}: {
  counts: { peripherals: number; reviews: number; forumPosts: number }
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <div className="text-xl font-bold text-foreground">
            <AnimatedCounter value={counts.peripherals} />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Periféricos
          </div>
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">
            <AnimatedCounter value={counts.reviews} />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reviews</div>
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">
            <AnimatedCounter value={counts.forumPosts} />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tópicos</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/tierlist"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/30"
        >
          <Package className="size-4" />
          Explorar Tierlist
        </Link>
        <Link
          href="/loja"
          className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-600 transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-300"
        >
          <ShoppingBag className="size-4" />
          Ver Loja
        </Link>
      </div>
    </div>
  )
}
