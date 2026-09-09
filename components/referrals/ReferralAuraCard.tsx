import Link from "next/link"
import { ArrowRight, Gift } from "lucide-react"

import { REFERRAL_REWARD_DIRECT, REFERRAL_REWARD_INDIRECT } from "@/lib/referral-code"

/**
 * Card do Programa de Indicação na Central de Aura.
 *
 * Resumo curto de propósito: a explicação completa (verificadores, prazo,
 * limites, os dois níveis) mora em /indicar, e duplicá-la aqui garantiria que
 * uma das duas versões ficasse desatualizada. Aqui só o suficiente para a
 * pessoa entender que existe e querer clicar.
 */
export function ReferralAuraCard() {
  return (
    <Link
      href="/indicar"
      className="group flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.07]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Gift className="size-5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Indique amigos</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          +{REFERRAL_REWARD_DIRECT} de Aura por amigo que confirmar a conta, e +
          {REFERRAL_REWARD_INDIRECT} quando ele indicar alguém.
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  )
}
