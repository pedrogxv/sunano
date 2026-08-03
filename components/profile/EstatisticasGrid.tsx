import { Flame, MessageSquare, Users } from "lucide-react"

import { cn } from "@/lib/utils"

type Estatistica = {
  icone: React.ElementType
  rotulo: string
  valor: number
  /** Cor do ícone e do número. */
  tom: string
  /** Fundo do círculo atrás do ícone — mesma cor, bem diluída. */
  fundo: string
  /** Ícone chapado (aura é uma chama cheia, não um contorno). */
  preenchido?: boolean
}

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

/**
 * Mini-cards de estatística do header: aura, contribuições no fórum e
 * seguidores — cada um com o ícone dentro de um círculo colorido, minimalista.
 *
 * Favoritos ficam de fora daqui: já têm seção própria (`FavoritosGrid`) mais
 * abaixo na página, repeti-los aqui só inflaria a grade.
 */
export function EstatisticasGrid({
  aura,
  posts,
  comentarios,
  seguidores,
  className,
}: {
  aura: number
  posts: number
  comentarios: number
  seguidores: number
  className?: string
}) {
  const contribuicoes = posts + comentarios

  const itens: Estatistica[] = [
    // Laranja de fogo: no tema escuro `primary` é branco, e uma chama branca
    // não diz "aura" nenhuma (mesma escolha do card de /pessoas).
    {
      icone: Flame,
      rotulo: "Aura",
      valor: aura,
      tom: "text-orange-500",
      fundo: "bg-orange-500/10",
      preenchido: true,
    },
    {
      icone: MessageSquare,
      rotulo: contribuicoes === 1 ? "Contribuição" : "Contribuições",
      valor: contribuicoes,
      tom: "text-violet-400",
      fundo: "bg-violet-400/10",
    },
    {
      icone: Users,
      rotulo: seguidores === 1 ? "Seguidor" : "Seguidores",
      valor: seguidores,
      tom: "text-sky-400",
      fundo: "bg-sky-400/10",
    },
  ]

  return (
    <div className={cn("grid grid-cols-3 gap-2 sm:gap-3", className)}>
      {itens.map((item) => {
        const Icone = item.icone
        return (
          <div
            key={item.rotulo}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card/60 px-3 py-2.5 sm:gap-3 sm:px-4"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9",
                item.fundo
              )}
            >
              <Icone
                className={cn("size-4", item.tom)}
                {...(item.preenchido ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
              />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold text-foreground sm:text-lg">
                {formatCount(item.valor)}
              </span>
              <span className="mt-1 text-[11px] leading-none text-muted-foreground">
                {item.rotulo}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Reexportado para o header não precisar duplicar a regra de milhar. */
export { formatCount }
