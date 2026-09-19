"use client"

import { Crown, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { VIP_AURA_DISCOUNT_PERCENT } from "@/lib/aura-pricing"

interface AuraVipDiscountBannerProps {
  isVip: boolean
  /**
   * Preços de tabela do que está à venda agora. Serve só de presença: a faixa
   * some quando não há nada à venda (ver o `return null` abaixo).
   */
  listPrices: number[]
  /** Abre o modal de vantagens do VIP — só faz sentido para quem não é VIP. */
  onShowBenefits?: () => void
}

/**
 * Faixa acima da loja explicando o desconto de Aura do VIP.
 *
 * Dois estados, mesma faixa:
 *   • VIP     → confirma que os preços da grade abaixo JÁ estão com desconto.
 *   • Comum   → mostra o mesmo desconto como o que ele está deixando na mesa,
 *               com atalho para as vantagens.
 *
 * Some quando não há nada à venda (`listPrices` vazio) — uma faixa
 * anunciando desconto sobre uma loja vazia seria ruído.
 */
export function AuraVipDiscountBanner({ isVip, listPrices, onShowBenefits }: AuraVipDiscountBannerProps) {
  if (listPrices.length === 0) return null

  return (
    <div
      className={cn(
        "aura-vip-savings-banner flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3",
        CARD_SURFACE
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: "oklch(0.75 0.19 320 / 0.15)", color: "var(--vip-accent)" }}
      >
        <Crown className={cn("size-4.5", isVip && "vip-badge-crown")} strokeWidth={1.8} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-snug text-foreground">
          {isVip ? (
            <>
              Seu desconto VIP de{" "}
              <span className="vip-badge-text">{VIP_AURA_DISCOUNT_PERCENT}%</span> já está aplicado
            </>
          ) : (
            <>
              VIP paga <span className="vip-badge-text">{VIP_AURA_DISCOUNT_PERCENT}% a menos</span> em tudo
              que custa Aura
            </>
          )}
        </p>
      </div>

      {!isVip && onShowBenefits && (
        <button
          type="button"
          onClick={onShowBenefits}
          className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-[var(--vip-accent-soft)]"
          style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
        >
          <Sparkles className="size-3" />
          Ver vantagens
        </button>
      )}
    </div>
  )
}
