import Link from "next/link"
import { Package, ShoppingBag } from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"
import { cn } from "@/lib/utils"

/**
 * Hero padrão da Home — o bloco "Periféricos sem mistério".
 *
 * Extraído de `app/page.tsx` quando o topo virou um carrossel de banners: hoje
 * ele aparece de dois jeitos — sozinho, como **fallback** enquanto não houver
 * nenhum banner ativo cadastrado em `/admin/banners`; ou como primeiro slide
 * do carrossel (`bare`), quando há banners — nesse caso a borda/fundo já vêm
 * do carrossel por fora, então o hero não duplica. O carrossel também
 * sobrepõe os números da comunidade em cima de todo slide, então o bloco de
 * estatísticas abaixo só aparece fora dele (`!bare`), pra não duplicar.
 */
export default function DefaultHero({
  counts,
  bare = false,
}: {
  counts: { peripherals: number; reviews: number; forumPosts: number }
  bare?: boolean
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden",
        !bare && "rounded-3xl border border-border bg-card"
      )}
    >
      {/* Dot-grid texture, same language as the auth pages */}
      <div
        className="pointer-events-none absolute inset-0 text-foreground/[0.05] dark:text-foreground/[0.1]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(ellipse 80% 60% at 25% 15%, black 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 25% 15%, black 40%, transparent 100%)",
        }}
      />

      {/* Decorative glow, tinted with the mascot's colors */}
      <div className="pointer-events-none absolute -top-20 right-0 size-72 rounded-full bg-amber-400/20 blur-3xl motion-safe:animate-[auth-blob-drift-a_16s_ease-in-out_infinite] dark:bg-amber-400/10" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-orange-500/10 blur-3xl motion-safe:animate-[auth-blob-drift-b_18s_ease-in-out_infinite]" />

      <div className="relative grid gap-6 px-6 py-10 md:grid-cols-[1.1fr_auto] md:items-center md:px-12 md:py-14">
        <div className="space-y-5">
          
          <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Periféricos sem{" "}
            <span className="relative inline-block">
              mistério
              <svg
                aria-hidden
                viewBox="0 0 220 24"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-3 w-full text-amber-400"
              >
                <path
                  d="M4 16C40 6 90 6 110 12C130 18 180 18 216 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            Veja a tierlist com nota de verdade, reviews reais da comunidade e curadoria do
            Sunano antes de comprar.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/tierlist"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/30"
            >
              <Package className="size-4" />
              Explorar Tierlist
            </Link>
            <Link
              href="/loja"
              className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-600 transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              <ShoppingBag className="size-4" />
              Ver Loja
            </Link>
          </div>

          {/* Stats — só fora do carrossel; lá dentro o overlay já cobre isso */}
          {!bare && (
            <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-6">
              <div>
                <div className="text-2xl font-bold text-foreground">
                  <AnimatedCounter value={counts.peripherals} />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Periféricos
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  <AnimatedCounter value={counts.reviews} />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Reviews
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  <AnimatedCounter value={counts.forumPosts} />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Tópicos
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mascot */}
        <div className="relative mx-auto hidden w-48 shrink-0 md:block lg:w-56">
          <div className="absolute inset-4 -z-10 rounded-full bg-amber-400/25 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/mascot/Logo-Sunano_calo-contorno.png"
            alt="Mascote do Sunano"
            className="w-full rotate-[-6deg] drop-shadow-2xl transition-transform duration-300 hover:rotate-0"
          />
        </div>
      </div>
    </section>
  )
}
