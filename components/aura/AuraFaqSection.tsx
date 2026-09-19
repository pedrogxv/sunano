"use client"

import Link from "next/link"
import { Ban, Bird, Coins, HelpCircle, Sparkles } from "lucide-react"
import { AuraIcon } from "@/components/ui/AuraIcon"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  AURA_GAIN_ENTRIES,
  AURA_NOT_COUNTED_ENTRIES,
  AURA_SPEND_ENTRIES,
  buildTrustTierRows,
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
  /**
   * Ofensiva atual do usuário — quando informada (junto de `isVip`), a seção
   * "Boost ativo" mostra os números reais dele. Omita nas páginas estáticas
   * (Central de Informações), onde só a regra genérica faz sentido.
   */
  streak?: number
  isVip?: boolean
  /** Conquista de inscrição no YouTube ligada — some a linha do YouTube no trust tier quando `false`. */
  youtubeEnabled?: boolean
  /** Esconde o cabeçalho "Como funciona a Aura" (a página já tem o próprio título). */
  hideHeading?: boolean
}

/**
 * FAQ completo de como o sistema de Aura funciona: fontes de ganho, onde
 * gastar, o que não conta, e o boost de streak+VIP — accordion em vez de modal
 * para ficar sempre navegável (Ctrl+F funciona, some tudo em mobile sem perder
 * o resto da página).
 *
 * Fonte única para a Central de Informações (`/informacoes/central-de-aura`,
 * texto genérico) e para a Central de Aura (`/aura`, com os números do usuário).
 */
export function AuraFaqSection({ streak, isVip, youtubeEnabled = false, hideHeading = false }: AuraFaqSectionProps) {
  const trustTierRows = buildTrustTierRows(youtubeEnabled)
  const showPersonalBoost = typeof streak === "number" && typeof isVip === "boolean"

  return (
    <div className="space-y-3">
      {!hideHeading && (
        <div className="flex items-center gap-2">
          <HelpCircle className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold text-foreground">Como funciona a Aura</h2>
        </div>
      )}

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
            <AuraIcon outline />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Boost ativo</span>
          </div>
          <div className="space-y-3 pb-4 text-sm text-muted-foreground">
            <p>
              A Ofensiva soma um bônus percentual a tudo que passa pelo multiplicador (posts, comentários, reviews e
              curtidas recebidas): sobe +0,1% por dia dentro de ciclos de 31 dias, até travar em 6% no dia 92+.
              {showPersonalBoost ? (
                streak > 0 ? (
                  <>
                    {" "}
                    Sua Ofensiva de <strong className="text-foreground">{streak} dia{streak === 1 ? "" : "s"}</strong>{" "}
                    hoje soma{" "}
                    <strong className="text-foreground">+{formatTotalAuraMultiplier(streak, isVip)}</strong> a cada
                    ganho{isVip ? " (já incluindo o bônus VIP)" : ""}.
                  </>
                ) : (
                  " Complete as 3 tarefas de hoje para começar a sua."
                )
              ) : null}
            </p>
            <p>
              VIP soma <strong className="text-foreground">+0,4%</strong> passivo sempre, ou{" "}
              <strong className="text-foreground">+0,25% adicional</strong> quando você já tem Ofensiva ativa no dia.
              {showPersonalBoost && !isVip && " Ative na loja abaixo."}
            </p>
            <p className="text-xs">
              O boost nunca se aplica às tarefas diárias, ao bônus de +10 por completá-las, nem às conquistas: esses
              valores são sempre fixos.
            </p>
          </div>
        </div>

        {/* Limites de reação — derivam do Trust Factor. A explicação COMPLETA
            da confiança mora em /informacoes/trust-factor; aqui fica só o
            recorte que responde "por que meu limite é diferente?", com link
            para lá. Duplicar a regra inteira nos dois lugares é como o site
            acumulou versões divergentes da mesma coisa. */}
        <div className="px-4 pt-4 pb-4 sm:px-5">
          <div className="flex items-center gap-2 pb-2">
            <Bird className="size-3.5 text-sky-400" strokeWidth={2} />
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Por que meu limite de reações é diferente do de outra pessoa?
            </span>
          </div>
          <p className="pb-3 text-sm text-muted-foreground">
            O limite vem do seu{" "}
            <Link href="/informacoes/trust-factor" className="text-primary hover:underline">
              Trust Factor
            </Link>
            , a medida de confiança da conta: quanto melhor a sua faixa, mais reações você pode dar por dia (no total, e
            para a mesma pessoa). É uma defesa contra contas descartáveis usadas para farmar Aura.
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
                {trustTierRows.map((row) => (
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
            Isso é sobre suas reações dadas, não sobre a Aura que você recebe; o limite não afeta quanto você ganha
            ao postar, comentar ou avaliar. As tarefas diárias reiniciam à meia-noite UTC (21h em Brasília).{" "}
            <Link href="/informacoes/trust-factor" className="text-primary hover:underline">
              Entenda o Trust Factor
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
