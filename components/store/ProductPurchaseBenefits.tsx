import { BadgeDollarSign, LifeBuoy, ShieldCheck, Truck } from "lucide-react"

import { AuraAmount, AuraIcon, AuraIconHolder } from "@/components/ui/AuraIcon"
import { cn } from "@/lib/utils"

type Benefit = {
  key: string
  icon: React.ReactNode
  iconClassName: string
  title: string
  text: string
}

interface ProductPurchaseBenefitsProps {
  /** Vai pelo correio (frete grátis é o modelo, ver lib/store-shipping.ts). */
  freeShipping: boolean
  /** Serviço: mesmo preço no PIX e no cartão, sem desconto a anunciar. */
  singlePrice: boolean
  /** Aura que a compra rende (já multiplicada pela quantidade). */
  aura: number
  className?: string
}

/**
 * O que dá confiança para comprar, colado no botão. Desconto no PIX e
 * parcelas NÃO entram aqui: já estão no bloco de preço, e repetir era ruído.
 * Cada item só aparece quando é verdade PARA ESTE produto (serviço não tem
 * frete; compra de menos de R$ 10 não rende Aura).
 *
 * Os itens de confiança vão numa faixa só, em colunas; a Aura, que é o
 * atrativo, ganha a linha própria com a chama pulsando.
 */
export function ProductPurchaseBenefits({ freeShipping, singlePrice, aura, className }: ProductPurchaseBenefitsProps) {
  const benefits: Benefit[] = []

  if (freeShipping) {
    benefits.push({
      key: "shipping",
      icon: <Truck className="size-4" />,
      iconClassName: "bg-emerald-500/15 text-emerald-400",
      title: "Frete grátis",
      text: "Todo o Brasil",
    })
  }
  if (singlePrice) {
    benefits.push({
      key: "single-price",
      icon: <BadgeDollarSign className="size-4" />,
      iconClassName: "bg-emerald-500/15 text-emerald-400",
      title: "Preço único",
      text: "PIX e cartão",
    })
  }
  benefits.push(
    {
      key: "secure",
      icon: <ShieldCheck className="size-4" />,
      iconClassName: "bg-violet-500/15 text-violet-300",
      title: "Compra segura",
      text: "Pagamento protegido",
    },
    {
      key: "support",
      icon: <LifeBuoy className="size-4" />,
      iconClassName: "bg-sky-500/15 text-sky-400",
      title: "Suporte Sunano",
      text: singlePrice ? "Conversa na compra" : "Pelo site",
    }
  )

  return (
    <div className={cn("space-y-2", className)}>
      <ul
        className="grid divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-muted/15 sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0"
        aria-label="Benefícios da compra"
      >
        {benefits.map((benefit) => (
          <li key={benefit.key} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", benefit.iconClassName)}>
              {benefit.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold leading-tight text-foreground">{benefit.title}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{benefit.text}</span>
            </span>
          </li>
        ))}
      </ul>

      {aura > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
            <AuraIconHolder>
              <AuraIcon size="xl" glow />
            </AuraIconHolder>
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[13px] font-bold leading-tight text-foreground">
              Ganhe <AuraAmount value={aura} size="sm" tone="brand" className="font-bold" />
            </span>
            <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
              {singlePrice ? "Creditada no pagamento" : "Creditada na entrega"}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
