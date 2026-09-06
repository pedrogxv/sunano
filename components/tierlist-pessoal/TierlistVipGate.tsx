"use client"

import { useState } from "react"
import { ArrowRight, Check, Crown } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { PERSONAL_TIERS, PERSONAL_TIER_THEMES } from "@/lib/personal-tierlist-theme"
import { VipUpsellModal } from "@/components/aura/VipUpsellModal"

/**
 * Aviso de que montar tierlist é exclusivo de VIP.
 *
 * Aparece em dois momentos, com textos diferentes (`variant`):
 *
 * - `"locked"` — a pessoa nunca teve VIP e não tem tierlist. É um convite:
 *   diz o que a feature faz antes de pedir a assinatura.
 * - `"expired"` — teve VIP e a tierlist já existe. Aqui o tom muda: o
 *   importante é tranquilizar (nada foi perdido) antes de convidar de volta.
 *   Mesma filosofia de `selectVisibleMedals`/favoritos em `lib/account-tier.ts`:
 *   rebaixar congela, nunca apaga.
 *
 * O CTA abre o `VipUpsellModal` — o mesmo popup de "Vantagens do VIP" que a
 * Central de Aura, a sidebar e o menu de conta já usam, para "Seja VIP"
 * significar a mesma coisa em todo lugar. Com a assinatura paga desligada
 * (`isVipSubscriptionEnabled`), o próprio modal oferece o caminho da Aura.
 */
export function TierlistVipGate({
  variant = "locked",
  compact = false,
  className,
}: {
  variant?: "locked" | "expired"
  /** Versão de uma linha, para caber dentro de outro bloco (ex.: header). */
  compact?: boolean
  className?: string
}) {
  const [upsellOpen, setUpsellOpen] = useState(false)
  const isExpired = variant === "expired"

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs",
          CARD_SURFACE,
          className
        )}
      >
        <Crown className="size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />
        <span className="text-muted-foreground">
          {isExpired
            ? "Sua tierlist continua no ar, mas editar exige VIP ativo."
            : "Montar tierlist é exclusivo para VIPs."}
        </span>
        <button
          type="button"
          onClick={() => setUpsellOpen(true)}
          className="font-semibold transition-opacity hover:opacity-80"
          style={{ color: "var(--vip-accent)" }}
        >
          {isExpired ? "Renovar VIP" : "Seja VIP"} →
        </button>

        <VipUpsellModal open={upsellOpen} onOpenChange={setUpsellOpen} />
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-5", CARD_SURFACE, className)}>
      {/* Faixa dos tiers no topo: a mesma assinatura visual do board, para o
          aviso parecer parte da feature e não um banner de anúncio. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-1">
        {PERSONAL_TIERS.map((tier) => (
          <div key={tier} className={cn("flex-1 bg-gradient-to-r", PERSONAL_TIER_THEMES[tier].accent)} />
        ))}
      </div>

      <div className="flex items-start gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--vip-accent-soft)" }}
        >
          <Crown className="size-5" style={{ color: "var(--vip-accent)" }} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">
            {isExpired ? "Seu VIP expirou — a tierlist continua sua" : "Tierlist pessoal é exclusiva para VIPs"}
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            {isExpired
              ? "Nada foi perdido: sua tierlist segue visível no perfil e para quem receber o link. Para voltar a mexer nela — adicionar, mover ou tirar periféricos — é só reativar o VIP."
              : "Monte seu próprio ranking dos periféricos que você já usou, do S ao D, e exiba no seu perfil para quem visitar."}
          </p>

          {!isExpired && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {[
                "Seu ranking do S ao D no perfil",
                "Recado curto explicando suas escolhas",
                "Corações de quem curtir sua lista",
                "Link próprio para compartilhar",
              ].map((benefit) => (
                <li key={benefit} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />
                  {benefit}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setUpsellOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--vip-accent)" }}
          >
            {isExpired ? "Reativar VIP" : "Seja VIP"}
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>

      <VipUpsellModal open={upsellOpen} onOpenChange={setUpsellOpen} />
    </div>
  )
}
