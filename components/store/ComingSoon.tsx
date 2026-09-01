import Link from "next/link"
import { ArrowLeft, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { StoreCountdown } from "@/components/store/StoreCountdown"

interface ComingSoonProps {
  icon: LucideIcon
  title: string
  description: string
  accent?: "emerald" | "amber"
  /** Data-alvo do lançamento; sem ela (env não configurada) o countdown não é exibido. */
  launchAt?: string | null
}

const ACCENT_STYLE = {
  emerald: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    icon: "text-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    countdown: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  amber: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    icon: "text-amber-400",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    countdown: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
} as const

export function ComingSoon({ icon: Icon, title, description, accent = "emerald", launchAt }: ComingSoonProps) {
  const style = ACCENT_STYLE[accent]

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Link
        href="/"
        className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao início
      </Link>

      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border py-20 text-center",
          style.border,
          style.bg
        )}
      >
        <Icon className={cn("size-12", style.icon)} />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-black tracking-tight text-foreground">{title}</h1>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider",
              style.badge
            )}
          >
            Coming soon
          </span>
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        {launchAt ? <StoreCountdown launchAt={launchAt} accentClassName={style.countdown} /> : null}
      </div>
    </div>
  )
}
