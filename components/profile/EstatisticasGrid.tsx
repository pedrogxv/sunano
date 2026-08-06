import { FileText, Flame, MessageSquare, Users } from "lucide-react"

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

/** Ícone + número + rótulo — a unidade repetida dentro de cada caixa. */
function Contador({ item, destaque = false }: { item: Estatistica; destaque?: boolean }) {
  const Icone = item.icone
  return (
    <div className="flex items-center gap-3 sm:gap-3.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full sm:size-10",
          item.fundo,
          destaque && "aura-stat-icon-holder"
        )}
      >
        <Icone
          className={cn("size-[18px] sm:size-5", item.tom, destaque && "aura-stat-icon")}
          {...(item.preenchido ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
        />
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-lg font-bold text-foreground sm:text-xl">
          {formatCount(item.valor)}
        </span>
        <span className="mt-1 text-xs leading-none text-muted-foreground">{item.rotulo}</span>
      </div>
    </div>
  )
}

/**
 * Caixas de estatística do header: aura, posts+comentários (uma caixa só,
 * já que os dois medem "produção no fórum") e seguidores.
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
  // Laranja de fogo: no tema escuro `primary` é branco, e uma chama branca
  // não diz "aura" nenhuma (mesma escolha do card de /pessoas).
  const auraItem: Estatistica = {
    icone: Flame,
    rotulo: "Aura",
    valor: aura,
    tom: "text-orange-500",
    fundo: "bg-orange-500/10",
    preenchido: true,
  }
  const postsItem: Estatistica = {
    icone: FileText,
    rotulo: posts === 1 ? "Post" : "Posts",
    valor: posts,
    tom: "text-emerald-400",
    fundo: "bg-emerald-400/10",
  }
  const comentariosItem: Estatistica = {
    icone: MessageSquare,
    rotulo: comentarios === 1 ? "Comentário" : "Comentários",
    valor: comentarios,
    tom: "text-violet-400",
    fundo: "bg-violet-400/10",
  }
  const seguidoresItem: Estatistica = {
    icone: Users,
    rotulo: seguidores === 1 ? "Seguidor" : "Seguidores",
    valor: seguidores,
    tom: "text-sky-400",
    fundo: "bg-sky-400/10",
  }

  return (
    <div className={cn("flex flex-wrap justify-center gap-3 sm:gap-4", className)}>
      <div className="aura-stat-card relative flex items-center rounded-xl border border-border bg-card/60 px-4 py-3 sm:px-5 sm:py-3.5">
        <Contador item={auraItem} destaque />
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-card/60 px-4 py-3 sm:gap-5 sm:px-5 sm:py-3.5">
        <Contador item={postsItem} />
        <div className="h-8 w-px shrink-0 bg-border sm:h-9" aria-hidden />
        <Contador item={comentariosItem} />
      </div>

      <div className="flex items-center rounded-xl border border-border bg-card/60 px-4 py-3 sm:px-5 sm:py-3.5">
        <Contador item={seguidoresItem} />
      </div>
    </div>
  )
}

/** Reexportado para o header não precisar duplicar a regra de milhar. */
export { formatCount }
