"use client"

import { useState } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Movimento de abrir/fechar das sidebars (pública e admin). Um módulo só para
 * as duas não divergirem de curva e tempo.
 *
 * A regra que deixa a animação fluida: NADA troca de layout no colapso. Os
 * rótulos não saem do DOM (`hidden` os fazia sumir no primeiro frame), os
 * ícones não mudam de `justify-*` (pulavam 2px para o centro) e o título de
 * seção não vira divisor de outra altura (empurrava todos os itens abaixo).
 * Só a LARGURA do painel anima; o ícone fica parado na coluna de 64px e o
 * rótulo é recortado pela borda enquanto esmaece.
 */

/** Curva "desacelera forte" (a da gaveta do iOS): sai rápido, pousa macio. */
export const SIDEBAR_EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"

/**
 * Transição do painel: largura (colapso no desktop) e translate (gaveta do
 * celular). `visibility` entra na lista para o `invisible` da gaveta fechada
 * esperar o slide de saída terminar. Nunca `transition-all`: animava também
 * cor, borda e sombra de tudo que muda junto.
 */
export const SIDEBAR_PANEL_TRANSITION = cn(
  "transition-[width,translate,visibility] duration-300 motion-reduce:transition-none",
  SIDEBAR_EASE
)

/**
 * Rótulo que esmaece com o colapso. Ao FECHAR some rápido e sem atraso (o
 * texto não pode ficar espremido enquanto a largura encolhe); ao ABRIR espera
 * o painel ganhar espaço e então aparece deslizando 4px. O `min-w-0` +
 * `overflow-hidden` deixa o flex reduzi-lo a zero em vez de vazar pela borda.
 */
export function sidebarFade(collapsed: boolean) {
  return cn(
    "min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,translate] ease-out motion-reduce:transition-none",
    collapsed
      ? "pointer-events-none -translate-x-1 opacity-0 duration-150"
      : "translate-x-0 opacity-100 delay-100 duration-200"
  )
}

/**
 * Título de seção. Ocupa a MESMA altura nos dois estados: o título esmaece e
 * um divisor aparece no lugar, sem mover os itens de baixo.
 */
export function SidebarSectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <div className="relative mb-1.5 mt-5 h-4">
      <p
        className={cn(
          "absolute inset-x-0 bottom-0 px-3 text-[11px] font-semibold uppercase leading-4 tracking-wider text-muted-foreground",
          sidebarFade(collapsed)
        )}
      >
        {label}
      </p>
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-2 top-1/2 h-px bg-white/10 transition-opacity duration-200 motion-reduce:transition-none",
          collapsed ? "opacity-100 delay-100" : "opacity-0"
        )}
      />
    </div>
  )
}

/**
 * Nome do item ao lado do ícone com a sidebar FECHADA (hover ou foco pelo
 * Tab; toque não abre, e no celular a gaveta nunca está fechada). Aberta, o
 * rótulo já está visível e o balão seria repetição.
 *
 * - Substitui o `title` nativo: ele demora ~1s, não abre no foco do teclado
 *   e tem a cara do sistema operacional.
 * - O `Tooltip` fica SEMPRE montado e só o `open` é travado em `false` com a
 *   sidebar aberta. Trocar a árvore conforme o estado remontaria o item no
 *   meio do colapso e cortaria o esmaecer do rótulo.
 * - 150ms de espera evita o balão piscar quando o cursor só atravessa a
 *   coluna; depois do primeiro, o `skipDelayDuration` do provider faz os
 *   vizinhos abrirem na hora, então percorrer a lista lê como um menu.
 * - `count` repete o contador que, fechada, ou some com o rótulo ou vira um
 *   ponto sem número.
 */
export function SidebarTooltip({
  label,
  collapsed,
  count,
  children,
}: {
  label: string
  collapsed: boolean
  count?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // O Radix compara o pedido com o `open` EXIBIDO: com a sidebar aberta ele
  // avisava "abrir" no hover, mas nunca "fechar" (já estava `false` para ele),
  // e o `true` ficava guardado. Ao fechar a sidebar, todo item que já tinha
  // recebido hover abria de uma vez. Por isso só aceita abrir quando fechada
  // e zera o estado a cada troca de estado da sidebar.
  const [prevCollapsed, setPrevCollapsed] = useState(collapsed)
  if (prevCollapsed !== collapsed) {
    setPrevCollapsed(collapsed)
    setOpen(false)
  }
  return (
    <Tooltip
      open={collapsed && open}
      onOpenChange={(next) => setOpen(collapsed && next)}
      delayDuration={150}
    >
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={14} className="flex-row gap-2 font-medium">
        {label}
        {!!count && count > 0 && (
          <span className="rounded-full bg-background/15 px-1.5 text-[10px] font-bold tabular-nums">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
