"use client"

import { Check, Copy, Ticket } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

/**
 * Cupom com "copiar" — o chip inteiro é o botão.
 *
 * O canal do Telegram manda o código como texto solto no meio da mensagem, o
 * que obriga o visitante a selecionar na mão (e no mobile isso é ruim). Aqui o
 * código vira um alvo de clique único.
 */
export function CouponChip({
  code,
  copyLabel,
  copiedLabel,
  copiedToast,
  copyFailed,
  className,
}: {
  code: string
  copyLabel: string
  copiedLabel: string
  copiedToast: string
  copyFailed: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sem isso o setTimeout dispara depois do card sair da tela (troca de página
  // da listagem) e o React avisa de setState em componente desmontado.
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(copiedToast, { description: code })
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(copyFailed)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? copiedLabel : copyLabel}
      aria-label={`${copyLabel}: ${code}`}
      className={cn(
        "group/coupon flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-left transition-all",
        copied
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-amber-500/40 bg-amber-500/[0.07] hover:border-amber-500/70 hover:bg-amber-500/[0.13]",
        className
      )}
    >
      <Ticket
        className={cn(
          "size-4 shrink-0 transition-colors",
          copied ? "text-emerald-400" : "text-amber-400"
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-sm font-bold tracking-wider transition-colors",
          copied ? "text-emerald-300" : "text-amber-200"
        )}
      >
        {code}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          copied ? "text-emerald-400" : "text-amber-400/70 group-hover/coupon:text-amber-300"
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span className="hidden sm:inline">{copied ? copiedLabel : copyLabel}</span>
      </span>
    </button>
  )
}
