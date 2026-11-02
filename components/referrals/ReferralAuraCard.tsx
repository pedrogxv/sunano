import Link from "next/link"
import { ArrowRight, UserPlus } from "lucide-react"

import { AuraAmount } from "@/components/ui/AuraIcon"
import { REFERRAL_REWARD_DIRECT, REFERRAL_REWARD_INDIRECT } from "@/lib/referral-code"

/**
 * Card do Programa de Indicação na Central de Aura (painel "Ganhe Aura").
 *
 * Resumo curto de propósito: a explicação completa (verificadores, prazo,
 * limites, os dois níveis) mora em /indicar, e duplicá-la aqui garantiria que
 * uma das duas versões ficasse desatualizada. Aqui só o suficiente para a
 * pessoa entender que existe e querer clicar: as duas recompensas em número
 * grande, como um vale, em vez de uma frase com os números no meio.
 */
export function ReferralAuraCard() {
  return (
    <Link
      href="/indicar"
      className="aura-hub-well group flex flex-wrap items-center gap-x-4 gap-y-3 p-4 transition-colors hover:bg-black/30"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-orange-500 text-[#1f0d00] shadow-[0_0_18px_-4px] shadow-orange-500/70">
        <UserPlus className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold text-foreground">Indique amigos</p>
        <p className="text-xs text-muted-foreground">Ganhe quando eles confirmarem a conta</p>
      </div>

      {/* Os dois níveis, separados por um picote como os bilhetes de sorteio. */}
      <div className="flex items-stretch gap-3 max-sm:w-full">
        <div className="text-center">
          <AuraAmount value={REFERRAL_REWARD_DIRECT} prefix="+" className="justify-center font-display text-lg font-bold text-orange-400" />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">por amigo</p>
        </div>
        <span aria-hidden className="w-px border-l border-dashed border-white/15" />
        <div className="text-center">
          <AuraAmount value={REFERRAL_REWARD_INDIRECT} prefix="+" className="justify-center font-display text-lg font-bold text-amber-300" />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">se ele indicar</p>
        </div>
      </div>

      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground max-sm:hidden" />
    </Link>
  )
}
