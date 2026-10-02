import { BadgeDollarSign, CreditCard, LifeBuoy, QrCode, ShieldCheck, Truck } from "lucide-react"

import { AuraAmount, AuraIcon, AURA_BRAND_BG_CLASS } from "@/components/ui/AuraIcon"
import { cn } from "@/lib/utils"

type Benefit = {
  key: string
  icon: React.ReactNode
  iconClassName: string
  title: React.ReactNode
  text: string
}

interface ProductPurchaseBenefitsProps {
  /** Vai pelo correio (frete grátis é o modelo, ver lib/store-shipping.ts). */
  freeShipping: boolean
  /** Serviço: mesmo preço no PIX e no cartão, sem desconto a anunciar. */
  singlePrice: boolean
  pixDiscountPercent: number
  maxInstallments: number
  /** Aura que a compra rende (já multiplicada pela quantidade). */
  aura: number
  className?: string
}

/**
 * O que dá confiança para comprar, colado no botão: a pessoa não precisa
 * sair da página para saber de frete, desconto, parcelas, segurança, suporte
 * e Aura. Cada item só aparece quando é verdade PARA ESTE produto (serviço
 * não tem frete nem desconto no PIX; compra de menos de R$ 10 não rende Aura).
 */
export function ProductPurchaseBenefits({
  freeShipping,
  singlePrice,
  pixDiscountPercent,
  maxInstallments,
  aura,
  className,
}: ProductPurchaseBenefitsProps) {
  const benefits: Benefit[] = []

  if (freeShipping) {
    benefits.push({
      key: "shipping",
      icon: <Truck className="size-4" />,
      iconClassName: "bg-emerald-500/15 text-emerald-400",
      title: "Frete grátis",
      text: "Para todo o Brasil",
    })
  }
  if (singlePrice) {
    benefits.push({
      key: "single-price",
      icon: <BadgeDollarSign className="size-4" />,
      iconClassName: "bg-emerald-500/15 text-emerald-400",
      title: "Preço único",
      text: "O mesmo no PIX e no cartão",
    })
  } else if (pixDiscountPercent > 0) {
    benefits.push({
      key: "pix",
      icon: <QrCode className="size-4" />,
      iconClassName: "bg-emerald-500/15 text-emerald-400",
      title: "PIX com desconto",
      text: `${pixDiscountPercent}% off à vista`,
    })
  }
  if (maxInstallments > 1) {
    benefits.push({
      key: "installments",
      icon: <CreditCard className="size-4" />,
      iconClassName: "bg-sky-500/15 text-sky-400",
      title: `Até ${maxInstallments}x sem juros`,
      text: "No cartão de crédito",
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
      iconClassName: "bg-violet-500/15 text-violet-300",
      title: "Suporte Sunano",
      text: singlePrice ? "Conversa aberta na compra" : "Atendimento pelo site",
    }
  )
  if (aura > 0) {
    benefits.push({
      key: "aura",
      icon: <AuraIcon size="lg" />,
      iconClassName: AURA_BRAND_BG_CLASS,
      title: (
        <>
          Ganhe <AuraAmount value={aura} size="sm" tone="brand" className="font-bold" />
        </>
      ),
      text: singlePrice ? "Creditada no pagamento" : "Creditada na entrega",
    })
  }

  return (
    <ul className={cn("grid grid-cols-2 gap-2", className)} aria-label="Benefícios da compra">
      {benefits.map((benefit) => (
        <li key={benefit.key} className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/15 px-3 py-2.5">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", benefit.iconClassName)}>
            {benefit.icon}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[12.5px] font-bold leading-tight text-foreground">{benefit.title}</span>
            <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{benefit.text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
