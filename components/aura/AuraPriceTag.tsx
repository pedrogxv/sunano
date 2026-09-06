"use client"

import { Crown } from "lucide-react"

import { cn } from "@/lib/utils"
import { auraPriceForVip } from "@/lib/aura-pricing"

interface AuraPriceTagProps {
  /** Preço de tabela do catálogo (`item.auraCost`), sempre o valor cheio. */
  listPrice: number
  /** VIP ativo agora — decide se o desconto aparece. */
  isVip: boolean
  /**
   * Ícone da moeda. Os cards usam 🔥 (Aura); o card do escudo usa 🧊 como
   * arte própria — a moeda é a mesma, só o emoji muda.
   */
  icon?: string
  /** Classe de cor do preço em destaque, para o card casar com sua paleta. */
  priceClassName?: string
  className?: string
}

/**
 * Preço de um item da Central de Aura, já contando o desconto VIP.
 *
 * Para VIP mostra os dois números: o de tabela riscado e o que vai sair da
 * carteira, com um selo "VIP −10%". Para conta comum mostra só o preço
 * cheio — sem "de/por" fantasma, que insinuaria uma promoção que ele não tem.
 *
 * O número exibido é prévia: quem decide o débito é a RPC em SQL
 * (ver lib/aura-pricing.ts).
 */
export function AuraPriceTag({
  listPrice,
  isVip,
  icon = "🔥",
  priceClassName = "text-orange-400",
  className,
}: AuraPriceTagProps) {
  const price = auraPriceForVip(listPrice, isVip)

  if (!price.discounted) {
    return (
      <p className={cn("font-display text-lg font-bold", priceClassName, className)}>
        {icon} {price.listPrice.toLocaleString("pt-BR")}
      </p>
    )
  }

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5", className)}>
      <span className="font-display text-[11px] font-bold text-muted-foreground/70 line-through decoration-[1.5px]">
        {price.listPrice.toLocaleString("pt-BR")}
      </span>
      <p className={cn("font-display text-lg font-bold", priceClassName)}>
        {icon} {price.finalPrice.toLocaleString("pt-BR")}
      </p>
      <span className="aura-vip-discount-badge flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[9px] font-black uppercase leading-none tracking-wide">
        <Crown className="size-2.5" strokeWidth={2.5} />−{price.discountPercent}%
      </span>
    </div>
  )
}
