"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Crown, Keyboard, PackageCheck, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { AuraIcon, AuraIconHolder } from "@/components/ui/AuraIcon"
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { vipCtaLabel } from "@/lib/vip-status"
import {
  VIP_PLANS,
  VIP_SUPPORT_MESSAGE,
  formatBrlCents,
  vipSubscriptionBenefits,
} from "@/lib/vip-plan"
import { useAuthUser } from "@/components/providers/auth-context"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"
import type { HomeAuraPeripheral } from "@/lib/server/repositories/home-repository"

interface AuraSpotlightProps {
  /** Produtos físicos da Central, já ordenados pelo repositório (disponível e mais caro primeiro). */
  peripherals: HomeAuraPeripheral[]
}

/**
 * Seção "Central de Aura" da Home — a vitrine que explica, para quem chega no
 * site, que participar vale prêmio e que o VIP é o que mantém isso de pé.
 *
 * Os PRODUTOS FÍSICOS vêm primeiro e ocupam o espaço maior: são o item de
 * maior apelo da Central e a razão concreta de alguém juntar Aura. Molduras e
 * cosméticos ficam de fora daqui de propósito — quem se interessa por eles
 * clica e vê tudo em `/aura`; a Home tem um único tiro para convencer.
 *
 * Nada aqui resgata nem cobra: todo caminho leva para `/aura` (resgate, que
 * exige Trust Factor "Muito Bom" e endereço) ou para o `VipUpsellModal` — o MESMO
 * popup da sidebar, do menu da conta e da tierlist, para o verbo do VIP não
 * divergir mais uma vez por tela (ver `lib/vip-status.ts`).
 */
export function AuraSpotlight({ peripherals }: AuraSpotlightProps) {
  const { user: authUser } = useAuthUser()
  const [vipUpsellOpen, setVipUpsellOpen] = useState(false)

  // Mesmo gate da sidebar: `isVip` (VIP valendo AGORA), nunca "tem assinatura
  // viva" — quem cancelou dentro do período pago continua VIP e não pode
  // receber oferta de assinar de novo enquanto o acesso dele corre.
  const isVip = authUser?.vip.isVip ?? false
  const showVipCta = !isVip && isVipSubscriptionEnabled()
  const ctaLabel = (authUser ? vipCtaLabel(authUser.vip) : null) ?? "Seja VIP"

  // Só os três primeiros: a grade da Home é rasa, e o repositório já põe na
  // frente o que ainda tem unidade.
  const showcase = peripherals.slice(0, 3)

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <AuraIconHolder>
              <AuraIcon size="xl" glow />
            </AuraIconHolder>
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              Central de Aura
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            Participe do site, junte Aura e troque por prêmio de verdade
          </p>
        </div>
        <Link
          href="/aura"
          className="group flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:bg-muted hover:text-foreground"
        >
          Ver Central
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        {/* Produtos físicos — o lado que ocupa mais espaço. */}
        {showcase.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {showcase.map((item) => (
              <PeripheralTeaser key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Apoio / VIP */}
        <VipSupportCard
          showCta={showVipCta}
          ctaLabel={ctaLabel}
          isVip={isVip}
          onOpenUpsell={() => setVipUpsellOpen(true)}
        />
      </div>

      <VipUpsellModal open={vipUpsellOpen} onOpenChange={setVipUpsellOpen} />
    </section>
  )
}

/**
 * Card de um produto físico. É um LINK para `/aura`, nunca um botão de
 * resgate: o resgate real exige Trust Factor "Muito Bom", saldo e endereço de entrega
 * — replicar isso aqui seria uma segunda porta divergindo da Central.
 */
function PeripheralTeaser({ item }: { item: HomeAuraPeripheral }) {
  const soldOut = item.unitsLeft <= 0

  return (
    <Link
      href="/aura"
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border transition-all duration-200",
        soldOut ? CARD_SURFACE : cn(CARD_SURFACE_INTERACTIVE, "hover:-translate-y-1")
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--card-image-bg)]">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className={cn(
              "h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105",
              soldOut && "opacity-40 grayscale"
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Keyboard className="size-14 text-amber-500/50" strokeWidth={1.15} />
          </div>
        )}

        {soldOut ? (
          <span className="absolute left-2 top-2 z-[1] flex items-center gap-1 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-200">
            <PackageCheck className="size-2.5" strokeWidth={2.5} />
            Esgotado
          </span>
        ) : (
          <span className="absolute left-2 top-2 z-[1] rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-[#1a1200]">
            {item.unitsLeft} de {item.stock}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-[1.3] text-foreground">
          {item.name}
        </h3>
        {/* Preço de TABELA, sem o desconto VIP: a Home é cacheada para todo
            mundo (ISR), então não há como saber aqui quem é VIP sem tornar a
            página dinâmica. O valor com desconto aparece na Central. */}
        <p className="mt-auto flex items-center gap-1 font-display text-lg font-bold text-orange-400">
          <AuraIcon size="lg" tone="inherit" />
          {item.auraCost.toLocaleString("pt-BR")}
        </p>
      </div>
    </Link>
  )
}

/**
 * Bloco de apoio ao site. Para quem não é VIP, vende a assinatura com os três
 * primeiros benefícios da fonte única (`vipSubscriptionBenefits`, que já some
 * com o que venceu — a Moldura de Fundador tem prazo). Para quem já é VIP,
 * vira agradecimento e atalho para a Central, sem oferta nenhuma.
 */
function VipSupportCard({
  showCta,
  ctaLabel,
  isVip,
  onOpenUpsell,
}: {
  showCta: boolean
  ctaLabel: string
  isVip: boolean
  onOpenUpsell: () => void
}) {
  const benefits = vipSubscriptionBenefits().slice(0, 3)

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-xl border p-4"
      style={{ borderColor: "var(--vip-accent-soft)" }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full blur-3xl"
        style={{ background: "var(--vip-accent-soft)", opacity: 0.25 }}
      />

      <div className="relative flex items-center gap-2">
        <Crown className="size-[18px] shrink-0 vip-badge-crown" style={{ color: "var(--vip-accent)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--vip-accent)" }}>
          {isVip ? "Obrigado por apoiar o site" : "Apoie o site, vire VIP"}
        </h3>
      </div>

      {isVip ? (
        <>
          <p className="relative mt-2 text-xs leading-relaxed text-muted-foreground">
            Seu VIP é o que mantém o site no ar e em constante melhoria. Aproveite: tudo que custa
            Aura sai 10% mais barato para você.
          </p>
          <Link
            href="/aura"
            className="relative mt-auto flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-[var(--vip-accent-soft)]"
            style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
          >
            <Sparkles className="size-3.5" />
            Gastar minha Aura
          </Link>
        </>
      ) : (
        <>
          <p className="relative mt-2 text-xs leading-relaxed text-muted-foreground">
            {VIP_SUPPORT_MESSAGE}
          </p>

          <ul className="relative mt-3 space-y-1.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Check className="mt-[1px] size-3 shrink-0" style={{ color: "var(--vip-accent)" }} />
                <span className="line-clamp-2">{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="relative mt-auto pt-3">
            {showCta ? (
              <button
                type="button"
                onClick={onOpenUpsell}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-[var(--vip-accent-soft)]"
                style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
              >
                <Crown className="size-3.5" />
                {ctaLabel} · {formatBrlCents(VIP_PLANS.monthly.priceCents)}
                {VIP_PLANS.monthly.unitLabel}
              </button>
            ) : (
              // Assinatura paga desligada (`VIP_SUBSCRIPTION_ENABLED`): o VIP
              // por Aura segue existindo na Central, então o convite aponta
              // para lá em vez de sumir.
              <Link
                href="/aura"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-[var(--vip-accent-soft)]"
                style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
              >
                <Crown className="size-3.5" />
                Ver vantagens do VIP
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
