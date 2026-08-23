"use client"

import { Ban, Coins, Flame, HelpCircle, ShieldCheck, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  AURA_GAIN_ENTRIES,
  AURA_NOT_COUNTED_ENTRIES,
  AURA_SPEND_ENTRIES,
  TRUST_TIER_ROWS,
  type AuraFaqEntry,
} from "@/lib/aura-faq"
import { formatTotalAuraMultiplier } from "@/lib/streak-multiplier"

const GROUPS: Array<{
  id: string
  icon: React.ElementType
  title: string
  accent: string
  entries: AuraFaqEntry[]
}> = [
  { id: "gain", icon: Sparkles, title: "Como ganhar Aura", accent: "text-orange-400", entries: AURA_GAIN_ENTRIES },
  { id: "spend", icon: Coins, title: "Onde gastar Aura", accent: "text-emerald-400", entries: AURA_SPEND_ENTRIES },
  { id: "not-counted", icon: Ban, title: "O que NÃO gera Aura", accent: "text-red-400", entries: AURA_NOT_COUNTED_ENTRIES },
]

interface AuraFaqSectionProps {
  streak: number
  isVip: boolean
}

/**
 * FAQ completo de como o sistema de Aura funciona: fontes de ganho, onde
 * gastar, o que não conta, e o boost de streak+VIP com números reais do
 * usuário atual — accordion em vez de modal para ficar sempre navegável
 * (Ctrl+F funciona, some tudo em mobile sem perder o resto da página).
 */
export function AuraFaqSection({ streak, isVip }: AuraFaqSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <HelpCircle className="size-4 text-muted-foreground" />
        <h2 className="font-display text-lg font-bold text-foreground">Como funciona a Aura</h2>
      </div>

      <div className={cn("rounded-2xl border", CARD_SURFACE)}>
        {GROUPS.map((group) => (
          <div key={group.id} className="border-b border-border/60 px-4 last:border-b-0 sm:px-5">
            <div className="flex items-center gap-2 pt-4 pb-1">
              <group.icon className={cn("size-3.5", group.accent)} strokeWidth={2} />
              <span className={cn("text-xs font-bold uppercase tracking-wider", group.accent)}>{group.title}</span>
            </div>
            <Accordion type="single" collapsible>
              {group.entries.map((entry) => (
                <AccordionItem key={entry.id} value={entry.id}>
                  <AccordionTrigger className="text-sm text-foreground">{entry.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{entry.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}

        {/* Boost — números concretos do usuário, não só a regra genérica */}
        <div className="px-4 pt-4 pb-1 sm:px-5">
          <div className="flex items-center gap-2 pb-1">
            <Flame className="size-3.5 text-amber-400" strokeWidth={2} />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Boost ativo</span>
          </div>
          <div className="space-y-3 pb-4 text-sm text-muted-foreground">
            <p>
              A Ofensiva soma um bônus percentual a tudo que passa pelo multiplicador (posts, comentários, reviews e
              curtidas recebidas): sobe +0,1% por dia dentro de ciclos de 31 dias, até travar em 6% no dia 92+.
              {streak > 0 ? (
                <>
                  {" "}
                  Sua Ofensiva de <strong className="text-foreground">{streak} dia{streak === 1 ? "" : "s"}</strong>{" "}
                  hoje soma{" "}
                  <strong className="text-foreground">+{formatTotalAuraMultiplier(streak, isVip)}</strong> a cada
                  ganho{isVip ? " (já incluindo o bônus VIP)" : ""}.
                </>
              ) : (
                " Complete as 3 tarefas de hoje para começar a sua."
              )}
            </p>
            <p>
              VIP soma <strong className="text-foreground">+0,4%</strong> passivo sempre, ou{" "}
              <strong className="text-foreground">+0,25% adicional</strong> quando você já tem Ofensiva ativa no dia.
              {!isVip && " Ative na loja abaixo."}
            </p>
            <p className="text-xs">
              O boost nunca se aplica às tarefas diárias, ao bônus de +10 por completá-las, nem às conquistas — esses
              valores são sempre fixos.
            </p>
          </div>
        </div>

        {/* Trust tier — anti-farm, explica por que o limite de reações varia por conta */}
        <div className="px-4 pt-4 pb-4 sm:px-5">
          <div className="flex items-center gap-2 pb-2">
            <ShieldCheck className="size-3.5 text-sky-400" strokeWidth={2} />
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Por que meu limite de reações é diferente do de outra pessoa?
            </span>
          </div>
          <p className="pb-3 text-sm text-muted-foreground">
            Cada conta tem um nível de confiança que decide quantas reações ela pode dar por dia (no total, e para a
            mesma pessoa) — uma defesa contra contas descartáveis usadas para farmar Aura.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 pr-3 font-semibold">Nível</th>
                  <th className="pb-2 pr-3 font-semibold">Quando você está nele</th>
                  <th className="pb-2 pr-3 font-semibold">Limite diário</th>
                  <th className="pb-2 font-semibold">Por pessoa/dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {TRUST_TIER_ROWS.map((row) => (
                  <tr key={row.tier}>
                    <td className="py-2 pr-3 font-semibold text-foreground">{row.label}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.criteria}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.dailyLimit}</td>
                    <td className="py-2 text-muted-foreground">{row.pairLimit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pt-3 text-xs text-muted-foreground">
            Isso é sobre suas reações dadas, não sobre a Aura que você recebe — o limite não afeta quanto você ganha
            ao postar, comentar ou avaliar. As tarefas diárias reiniciam à meia-noite UTC (21h em Brasília).
          </p>
        </div>
      </div>
    </div>
  )
}
