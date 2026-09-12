"use client"

import Image from "next/image"
import { useCallback, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"

import { TierRush } from "@/components/maintenance/TierRush"
import { useT } from "@/lib/use-t"

type StatusState = "idle" | "checking" | "still-down" | "back"

export default function MaintenancePage() {
  const t = useT()
  const m = t.maintenance
  const [status, setStatus] = useState<StatusState>("idle")

  // "Tentar novamente" consulta a sonda em vez de recarregar a página: durante
  // a manutenção um reload devolve exatamente esta mesma tela e ainda joga a
  // partida do mini-jogo fora. Só navegamos quando o site realmente voltou.
  const check = useCallback(async () => {
    setStatus("checking")
    try {
      const res = await fetch("/api/maintenance-status", { cache: "no-store" })
      const data = (await res.json()) as { maintenance?: boolean }
      if (data.maintenance === false) {
        setStatus("back")
        return
      }
      setStatus("still-down")
    } catch {
      // Rede fora ou deploy em andamento: tratamos como "ainda em manutenção",
      // que é a leitura honesta — não sabemos se voltou.
      setStatus("still-down")
    }
  }, [])

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_44%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_34%)]" />

      <section className="relative w-full max-w-2xl rounded-3xl border border-border bg-card/70 p-6 text-center shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur sm:p-9">
        {/* O PNG do mascote não tem canal alpha (fundo preto chapado). Sem o
            tile preto atrás ele aparece como um quadrado sobre o card, que é
            mais claro — mesmo tratamento usado em app/not-found.tsx. */}
        <div className="mb-5 flex justify-center">
          <div className="relative flex size-28 items-center justify-center rounded-3xl bg-black shadow-2xl ring-1 ring-white/10 sm:size-32">
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-primary/10 blur-3xl" />
            <Image
              src="/images/mascot/mascot-working.png"
              alt=""
              width={200}
              height={200}
              priority
              className="size-24 object-contain sm:size-28"
            />
          </div>
        </div>

        <p className="mx-auto mb-4 w-fit rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
          {m.mode}
        </p>

        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {m.title}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          {m.body1} {m.body2}
        </p>

        <div className="mt-7">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
            {m.gameTitle}
          </p>
          <TierRush />
        </div>

        <div className="mt-7 flex flex-col items-center gap-3">
          {status === "back" ? (
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              {m.statusBackOnline} — {m.statusBackAction}
            </a>
          ) : (
            <button
              type="button"
              onClick={check}
              disabled={status === "checking"}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted/40 disabled:opacity-60"
            >
              {status === "checking" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {status === "checking" ? m.statusChecking : m.tryAgain}
            </button>
          )}

          {status === "still-down" && (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {m.statusStillDown}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
