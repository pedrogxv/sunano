"use client"

import { ChevronRight, Crown } from "lucide-react"

import { formatBrlCents, vipYearlyMonthlyEquivalentCents } from "@/lib/vip-plan"
import { cn } from "@/lib/utils"
import { SidebarTooltip, sidebarFade } from "@/components/layout/sidebar-motion"

/**
 * Convite VIP encaixado no TOPO do painel de Aura da sidebar: uma aba roxa
 * que se funde ao card laranja logo abaixo (os dois formam um bloco só, com a
 * costura em gradiente roxo→laranja). Antes eram dois botões soltos — o
 * "Seja VIP" no fim do nav e a Central no rodapé — disputando atenção.
 *
 * Quem decide SE aparece é a sidebar (`isVip` + `isVipSubscriptionEnabled`);
 * aqui é só o desenho. O card de baixo precisa vir com `attached` para perder
 * a borda e o arredondamento de cima.
 */
export function SidebarVipTab({
  label,
  collapsed = false,
  onClick,
}: {
  label: string
  collapsed?: boolean
  onClick: () => void
}) {
  return (
    <SidebarTooltip label={label} collapsed={collapsed}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        // `px-[13px]`: com a borda, centra a coroa de 14px nos 64px da sidebar
        // fechada sem trocar de posição ao abrir (ver sidebar-motion).
        className="sidebar-vip-tab group relative flex w-full items-center gap-2 rounded-t-xl border border-b-0 border-[oklch(0.75_0.19_320/0.25)] px-[13px] py-1.5 text-left"
        style={{ color: "var(--vip-accent)" }}
      >
        <Crown className="size-3.5 shrink-0" />

        <span className={cn("flex flex-1 items-center gap-2", sidebarFade(collapsed))}>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatBrlCents(vipYearlyMonthlyEquivalentCents())}/mês
          </span>
          <ChevronRight className="-mr-1 size-3.5 shrink-0 opacity-60 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>

        {/* Costura com o card de Aura: o roxo do VIP desaguando no laranja */}
        <span aria-hidden className="sidebar-vip-tab-seam" />
      </button>
    </SidebarTooltip>
  )
}
