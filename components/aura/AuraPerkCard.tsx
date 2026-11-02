import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"

/**
 * Casca das VANTAGENS da Loja de Aura (Proteção de Ofensiva, Troca de nome,
 * VIP). Cada card só traz o ícone, o texto, o controle próprio e a ação; a
 * moldura, a ordem e a cor saem daqui.
 *
 * Antes cada um tinha a sua cópia: quadro de arte vazio com um ícone solto no
 * meio, tamanhos de fonte diferentes, um ou dois botões no rodapé — e os
 * preços e botões saíam desalinhados lado a lado. Agora o rodapé é sempre
 * preço + UMA ação; o que era segunda ação (assinar, gerenciar) mora no
 * `extra`, acima, e não empurra o rodapé.
 */
export type PerkAccent = "sky" | "cyan" | "vip"

const ACCENT: Record<
  PerkAccent,
  {
    /** Quadrado do ícone. */
    tile: string
    /** Brilho no canto do card, na cor da vantagem. */
    wash: string
    /** Borda quando a vantagem está ativa (guardada, assinada). */
    active: string
    /** Botão principal. */
    button: string
    /** Caixa de estado que ocupa o lugar do botão. */
    status: string
    /** Texto de link/ação secundária. */
    link: string
  }
> = {
  sky: {
    tile: "bg-sky-400/15 text-sky-300 ring-sky-400/30 shadow-sky-500/50",
    wash: "bg-[radial-gradient(120%_70%_at_0%_0%,rgba(56,189,248,0.13),transparent_65%)]",
    active: "border-sky-400/50",
    button: "bg-sky-500 text-[#04121c] hover:bg-sky-400",
    status: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    link: "text-sky-300",
  },
  cyan: {
    tile: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/30 shadow-cyan-500/50",
    wash: "bg-[radial-gradient(120%_70%_at_0%_0%,rgba(34,211,238,0.12),transparent_65%)]",
    active: "border-cyan-400/50",
    button: "bg-cyan-400 text-[#00201c] hover:bg-cyan-300",
    status: "border-border text-muted-foreground",
    link: "text-cyan-300",
  },
  vip: {
    tile: "bg-[var(--vip-accent-soft)]/40 text-[var(--vip-accent)] ring-(--vip-accent-soft) shadow-(color:--vip-accent-soft)",
    wash: "bg-[radial-gradient(120%_70%_at_0%_0%,color-mix(in_oklab,var(--vip-accent)_16%,transparent),transparent_65%)]",
    active: "border-[var(--vip-accent-soft)]",
    button: "bg-[var(--vip-accent)] text-black hover:opacity-90",
    status: "border-[var(--vip-accent-soft)] bg-[var(--vip-accent-soft)]/40 text-[var(--vip-accent)]",
    link: "text-[var(--vip-accent)]",
  },
}

export function AuraPerkCard({
  accent,
  icon,
  title,
  description,
  active = false,
  extra,
  price,
  action,
  children,
}: {
  accent: PerkAccent
  icon: React.ReactNode
  title: string
  description?: string | null
  /** Vantagem em uso: acende a borda e o ícone. */
  active?: boolean
  /** Controle próprio do card (variante, link de vantagens, assinatura). */
  extra?: React.ReactNode
  /** `AuraPriceTag`. Omitido quando o estado já dispensa preço. */
  price?: React.ReactNode
  /** `PerkAction` ou `PerkStatus`. */
  action: React.ReactNode
  /** Diálogos do card (confirmação, modal). */
  children?: React.ReactNode
}) {
  const a = ACCENT[accent]
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-3.5 transition-all duration-200 hover:-translate-y-1",
        CARD_SURFACE_INTERACTIVE,
        active && a.active
      )}
    >
      <span aria-hidden className={cn("pointer-events-none absolute inset-0", a.wash)} />

      <div className="relative flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 [&_svg]:size-5",
            a.tile,
            active && "shadow-[0_0_18px_-4px]"
          )}
        >
          {icon}
        </span>
        <h3 className="line-clamp-2 min-w-0 flex-1 font-sans text-[13px] font-semibold leading-tight text-foreground">
          {title}
        </h3>
      </div>

      {description && (
        <p className="relative line-clamp-3 text-[11px] leading-snug text-muted-foreground">{description}</p>
      )}

      {extra && <div className="relative">{extra}</div>}

      <div className="relative mt-auto space-y-2">
        {price}
        {action}
      </div>

      {children}
    </div>
  )
}

/** Botão principal da vantagem. Sem saldo, vira o mesmo "Saldo insuficiente" em todo card. */
export function PerkAction({
  accent,
  label,
  onClick,
  canAfford,
  loading = false,
  disabled = false,
}: {
  accent: PerkAccent
  label: string
  onClick: () => void
  canAfford: boolean
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled || !canAfford}
      title={!canAfford ? "Saldo de Aura insuficiente" : undefined}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed",
        canAfford ? ACCENT[accent].button : "bg-muted/40 text-muted-foreground"
      )}
    >
      {loading && <Loader2 className="size-3 animate-spin" />}
      {canAfford ? label : "Saldo insuficiente"}
    </button>
  )
}

/** Ocupa o lugar do botão quando não há o que comprar agora (guardada, ativo, cooldown). */
export function PerkStatus({
  accent,
  icon,
  label,
  detail,
}: {
  accent: PerkAccent
  icon?: React.ReactNode
  label: string
  detail?: string | null
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-0.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold [&_svg]:size-3",
        ACCENT[accent].status
      )}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {detail && <span className="text-[9.5px] font-medium opacity-70">{detail}</span>}
    </div>
  )
}

/** Classe do link/ação secundária na cor da vantagem, para o `extra` (serve em `<button>` e `<Link>`). */
export function perkLinkClass(accent: PerkAccent, className?: string) {
  return cn(
    "text-left text-[11px] font-semibold underline-offset-2 hover:underline disabled:opacity-50",
    ACCENT[accent].link,
    className
  )
}
