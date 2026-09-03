"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import {
  CalendarDays,
  CalendarRange,
  Infinity as InfinityIcon,
  Sun,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { DirectoryPeriod } from "@/lib/user-directory"

const OPTIONS: Array<{
  key: DirectoryPeriod
  label: string
  short: string
  icon: React.ElementType
}> = [
  { key: "all", label: "Todo o tempo", short: "Sempre", icon: InfinityIcon },
  { key: "month", label: "Últimos 30 dias", short: "Mês", icon: CalendarRange },
  { key: "week", label: "Últimos 7 dias", short: "Semana", icon: CalendarDays },
  { key: "today", label: "Hoje", short: "Hoje", icon: Sun },
]

/**
 * Segmented control do filtro de período das abas "Mais Aura" / "Mais Ativos".
 * Só aparece nessas duas (ver `PERIOD_AWARE_SORTS`): as demais não têm recorte
 * temporal.
 *
 * O indicador ativo é uma pílula posicionada por medição real do botão ativo
 * (`offsetLeft`/`offsetWidth`), não por frações de largura: os botões têm
 * larguras diferentes (ícone + texto variam) e há `gap` entre eles, então
 * dividir o container em quatro partes iguais desalinha a pílula. Medir mantém
 * a pílula exatamente sobre o botão em qualquer largura de tela.
 *
 * `loading` trava o clique enquanto a lista nova não chega, pra não empilhar
 * fetches numa sequência rápida de cliques.
 */
export function PeriodFilter({
  value,
  onChange,
  loading = false,
}: {
  value: DirectoryPeriod
  onChange: (period: DirectoryPeriod) => void
  loading?: boolean
}) {
  const groupId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  // useLayoutEffect: reposiciona antes do paint, pra a pílula não "saltar" de
  // uma posição errada para a certa ao montar / trocar de período.
  useLayoutEffect(() => {
    const btn = btnRefs.current[value]
    if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [value])

  // Fontes carregam depois do primeiro layout e mudam a largura dos botões;
  // um resize do container (breakpoint sm troca "∞" por "Sempre") também.
  useEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      const btn = btnRefs.current[value]
      if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label="Período do ranking"
      className="relative inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/30 p-1 shadow-sm"
    >
      {/* Pílula que desliza atrás do botão ativo. */}
      {pill && (
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-primary shadow-sm transition-[left,width] duration-300 ease-out"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const active = option.key === value
        return (
          <button
            key={option.key}
            ref={(node) => {
              btnRefs.current[option.key] = node
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            id={`${groupId}-${option.key}`}
            disabled={loading}
            onClick={() => !active && onChange(option.key)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4",
              active
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              loading && !active && "cursor-not-allowed opacity-60"
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {option.short}
          </button>
        )
      })}
    </div>
  )
}

/** Frase de tempo ("hoje", "nesta semana", "neste mês") para colar na descrição da aba. */
export function periodLabel(period: DirectoryPeriod): string {
  if (period === "today") return "hoje"
  if (period === "week") return "nesta semana"
  if (period === "month") return "neste mês"
  return ""
}
