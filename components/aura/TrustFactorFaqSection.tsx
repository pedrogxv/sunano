import Link from "next/link"
import { ArrowDown, ArrowUp, Bird, HelpCircle, Lock } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  TRUST_FAQ_DOWN_ENTRIES,
  TRUST_FAQ_GENERAL_ENTRIES,
  TRUST_FAQ_INTRO,
  TRUST_FAQ_LEVEL_ROWS,
  TRUST_FAQ_UP_ENTRIES,
  type AuraFaqEntry,
} from "@/lib/aura-faq"
import {
  TRUST_LEVELS,
  TRUST_PHYSICAL_REDEEM_LEVEL,
  trustLevelLabel,
  type TrustLevel,
} from "@/lib/trust-factor"
import { TrustSeal } from "@/components/ui/TrustBadge"

/**
 * FAQ do Trust Factor — a explicação canônica de como a confiança funciona.
 *
 * Fonte ÚNICA, igual a `AuraFaqSection`: usada pela Central de Informações
 * (`/informacoes/trust-factor`, texto genérico) e pela Central de Aura
 * (`/aura`, com a faixa real do usuário em destaque). Qualquer tela nova que
 * precise explicar Trust Factor deve LINKAR para cá, nunca reescrever o texto
 * — foi duplicando explicação que o site acumulou versões divergentes da
 * mesma regra.
 *
 * A escala das cinco faixas é desenhada com o `TrustSeal` de cada uma, em
 * ordem: é a forma mais rápida de alguém entender onde está e o que vem
 * depois, e reforça que o selo colorido que ela vê no perfil é este sistema.
 *
 * NENHUMA pontuação aparece aqui — só faixas. Ver `lib/aura-faq.ts`.
 */
export function TrustFactorFaqSection({
  /** Faixa do usuário logado — destaca a dela na escala. Omita nas páginas estáticas. */
  currentLevel,
  /** Esconde o cabeçalho (a página já tem o próprio título). */
  hideHeading = false,
}: {
  currentLevel?: TrustLevel
  hideHeading?: boolean
}) {
  return (
    <div className="space-y-3">
      {!hideHeading && (
        <div className="flex items-center gap-2">
          <HelpCircle className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold text-foreground">
            Como funciona o Trust Factor
          </h2>
        </div>
      )}

      <div className={cn("rounded-2xl border", CARD_SURFACE)}>
        {/* Intro + a escala das cinco faixas, desenhada com o selo de verdade */}
        <div className="border-b border-border/60 px-4 pt-4 pb-5 sm:px-5">
          <div className="flex items-center gap-2 pb-2">
            <Bird className="size-3.5 text-sky-400" strokeWidth={2} />
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              O que é o Trust Factor
            </span>
          </div>
          <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{TRUST_FAQ_INTRO}</p>

          <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-6">
            {TRUST_LEVELS.map((entry) => {
              const isCurrent = currentLevel === entry.level
              return (
                <div
                  key={entry.level}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors",
                    isCurrent && "bg-muted/50 ring-1 ring-border"
                  )}
                >
                  <TrustSeal level={entry.level} size="sm" />
                  {isCurrent && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Você está aqui
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[380px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 pr-3 font-semibold">Faixa</th>
                  <th className="pb-2 font-semibold">O que ela diz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {TRUST_FAQ_LEVEL_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 pr-3 font-semibold text-foreground">{row.label}</td>
                    <td className="py-2 text-muted-foreground">{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <FaqGroup
          id="trust-up"
          icon={ArrowUp}
          title="O que aumenta o Trust Factor"
          accent="text-emerald-400"
          entries={TRUST_FAQ_UP_ENTRIES}
        />

        <FaqGroup
          id="trust-down"
          icon={ArrowDown}
          title="O que diminui o Trust Factor"
          accent="text-red-400"
          entries={TRUST_FAQ_DOWN_ENTRIES}
        />

        <FaqGroup
          id="trust-general"
          icon={HelpCircle}
          title="Dúvidas comuns"
          accent="text-sky-400"
          entries={TRUST_FAQ_GENERAL_ENTRIES}
        />

        {/* Destaque do que a confiança de fato LIBERA — é o que a pessoa
            veio saber quando o botão do produto físico apareceu travado. */}
        <div className="px-4 pt-4 pb-5 sm:px-5">
          <div className="flex items-center gap-2 pb-2">
            <Lock className="size-3.5 text-amber-400" strokeWidth={2} />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Produtos físicos da Central de Aura
            </span>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:gap-4">
            <TrustSeal level={TRUST_PHYSICAL_REDEEM_LEVEL} size="md" />
            <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
              Os prêmios <strong className="text-foreground">físicos e de estoque limitado</strong> exigem
              Trust Factor{" "}
              <strong className="text-foreground">
                &quot;{trustLevelLabel(TRUST_PHYSICAL_REDEEM_LEVEL)}&quot;
              </strong>{" "}
              ou superior, e a conta sem nenhuma restrição ativa. São os itens de maior valor real do
              site, então a trava é alta de propósito: exige tempo de casa e histórico limpo, o que
              também impede que alguém crie contas novas só para disputá-los. Veja os produtos
              disponíveis na{" "}
              <Link href="/aura" className="text-primary hover:underline">
                Central de Aura
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqGroup({
  id,
  icon: Icon,
  title,
  accent,
  entries,
}: {
  id: string
  icon: React.ElementType
  title: string
  accent: string
  entries: AuraFaqEntry[]
}) {
  return (
    <div className="border-b border-border/60 px-4 last:border-b-0 sm:px-5">
      <div className="flex items-center gap-2 pt-4 pb-1">
        <Icon className={cn("size-3.5", accent)} strokeWidth={2} />
        <span className={cn("text-xs font-bold uppercase tracking-wider", accent)}>{title}</span>
      </div>
      <Accordion type="single" collapsible>
        {entries.map((entry) => (
          <AccordionItem key={entry.id} value={`${id}-${entry.id}`}>
            <AccordionTrigger className="text-sm text-foreground">{entry.question}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{entry.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
