import Link from "next/link"
import { ArrowRight, Recycle } from "lucide-react"

export function PromoBazarBanner() {
  return (
    <Link
      href="/bazar"
      className="group relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-[22px] border border-amber-500/25 p-8 transition-colors hover:border-amber-500/40 sm:flex-row sm:items-center"
      style={{ background: "radial-gradient(55% 90% at 85% 50%, oklch(0.8 0.15 85 / 0.14), var(--card))" }}
    >
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-amber-400">
          <Recycle className="size-3.5" />
          Bazar Sunano
        </p>
        <h3 className="font-display mb-1.5 text-2xl font-bold text-foreground">Também vendemos usados testados.</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Itens de procedência verificada, com o mesmo padrão de teste da Loja — por um preço melhor.
        </p>
      </div>
      <span className="flex h-[50px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-foreground px-6 text-sm font-extrabold text-background transition-transform group-hover:translate-x-1">
        Ver Bazar
        <ArrowRight className="size-4" />
      </span>
    </Link>
  )
}
