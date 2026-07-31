"use client"

import { useMemo, useState } from "react"
import { BookOpen, Calculator, HeartHandshake, Info } from "lucide-react"

import { cn } from "@/lib/utils"

type InfoTab = {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  content: React.ReactNode
}

export function RankingInfo() {
  const [activeTab, setActiveTab] = useState<string>("about")

  const tabs = useMemo<InfoTab[]>(() => {
    return [
      {
        id: "about",
        title: "Sobre",
        icon: Info,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-primary">
            <p>
              Este ranking avalia a performance dos teclados magnéticos. Quanto maior a pontuação,
              melhor e mais consistente será o desempenho em diferentes cenários de uso.
            </p>
            <p>
              No entanto, a performance não é o único fator que define a qualidade de um teclado.
              Aspectos como construção, software, estabilidade, recursos e custo-benefício também
              são fundamentais e devem ser considerados antes da compra.
            </p>
            <p>
              Se o seu objetivo é encontrar os teclados com o maior desempenho bruto possível,
              este ranking servirá como uma excelente base para a sua escolha.
            </p>
          </div>
        ),
      },
      {
        id: "references",
        title: "Referências",
        icon: BookOpen,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-primary">
            <p>
              Para este ranking, utilizamos como principal referência o trabalho do Laobazi, um
              dos criadores de conteúdo mais respeitados do cenário de tecnologia na China.
              Reconhecido por sua abordagem altamente técnica, ele realiza testes aprofundados em
              teclados para avaliar seu desempenho de forma objetiva.
            </p>
            <p>
              Essa tradição de testes rigorosos surgiu há muitos anos na comunidade chinesa. No
              passado, era comum que algumas fabricantes divulgassem especificações que seus
              produtos não conseguiam cumprir na prática. Isso fez com que o público se tornasse
              muito mais criterioso, incentivando especialistas como o Laobazi a desenvolver
              metodologias de teste cada vez mais completas para comprovar se os produtos
              realmente entregam o que prometem.
            </p>
          </div>
        ),
      },
      {
        id: "methodology",
        title: "Como é calculado",
        icon: Calculator,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-primary">
            <p>
              Diferentemente de muitos criadores de conteúdo e influenciadores do nicho, que
              costumam focar apenas nos aspectos mais superficiais dos teclados, o Laobazi realiza
              uma análise muito mais aprofundada, principalmente quando o assunto é estabilidade e
              consistência da performance.
            </p>
            <p>
              Um bom exemplo é o criador americano Miggs. Embora seu conteúdo seja bastante
              popular e útil para apresentar novos produtos, seus testes são mais voltados para a
              experiência prática do usuário do que para uma análise técnica rigorosa. Em alguns
              casos, ele utiliza a própria percepção para avaliar diferenças de latência que, na
              prática, só podem ser medidas com precisão por equipamentos específicos. Além disso,
              a forte influência do fator humano torna esse tipo de teste menos consistente para
              comparações extremamente precisas.
            </p>
            <p>
              Já o Laobazi adota uma metodologia muito mais técnica. Além de medir a latência do
              teclado, ele analisa a deadzone, verifica a precisão dos pontos de atuação, testa
              múltiplas teclas acionadas simultaneamente com Rapid Trigger e registra diferenças de
              tempo na escala de milissegundos e até frações menores, utilizando equipamentos
              apropriados para esse tipo de medição. Isso torna seus testes extremamente
              consistentes e confiáveis para quem busca a máxima precisão.
            </p>
            <p>
              Se você gosta desse lado mais técnico dos periféricos, recomendo assistir aos vídeos
              do Laobazi no YouTube. O conteúdo é bastante detalhado e oferece uma excelente visão
              sobre o desempenho real dos teclados magnéticos.
            </p>
          </div>
        ),
      },
      {
        id: "thanks",
        title: "Agradecimentos",
        icon: HeartHandshake,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-primary">
            <p>
              Gostaria de agradecer ao nosso colega Ryan pela grande ajuda na coleta de dados
              utilizados nesta tier list. Sua colaboração foi muito importante para tornar este
              projeto mais completo e confiável.
            </p>
            <p>
              O Ryan também possui um excelente canal no YouTube, com bastante conteúdo sobre
              periféricos e tecnologia. Se você gosta desse tipo de assunto, recomendo dar uma
              conferida e acompanhá-lo:{" "}
              <a
                href="https://www.youtube.com/@ryantechofc"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                youtube.com/@ryantechofc
              </a>
              .
            </p>
          </div>
        ),
      },
    ]
  }, [])

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="size-2 rounded-sm bg-primary" />
          Informações do Ranking
        </h2>
      </div>

      <div className="flex overflow-x-auto border-b border-border bg-muted/20">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all",
                isActive
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{tab.title}</span>
            </button>
          )
        })}
      </div>

      <div className="p-4 md:p-5">{activeContent.content}</div>
    </section>
  )
}
