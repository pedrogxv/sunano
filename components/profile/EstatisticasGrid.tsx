import { FileText, Flame, MessageSquare, Star, Users } from "lucide-react"

import { cn } from "@/lib/utils"

type Estatistica = {
  icone: React.ElementType
  rotulo: string
  valor: number
  /** Cor do ícone e do número. Sem cor, herda o tom neutro do card. */
  tom?: string
  /** Ícone chapado (aura é uma chama cheia, não um contorno). */
  preenchido?: boolean
}

function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}

/**
 * Mini-cards de estatística do header: aura, atividade no fórum e coleções.
 *
 * Ficam logo abaixo da bio, no lugar da linha de contadores soltos que existia
 * antes — o mesmo número, mas legível de relance em vez de espremido numa
 * frase.
 */
export function EstatisticasGrid({
  aura,
  posts,
  comentarios,
  favoritos,
  seguidores,
  className,
}: {
  aura: number
  posts: number
  comentarios: number
  favoritos: number
  seguidores: number
  className?: string
}) {
  const itens: Estatistica[] = [
    // Laranja de fogo: no tema escuro `primary` é branco, e uma chama branca
    // não diz "aura" nenhuma (mesma escolha do card de /pessoas).
    { icone: Flame, rotulo: "Aura", valor: aura, tom: "text-orange-500", preenchido: true },
    { icone: FileText, rotulo: posts === 1 ? "Post" : "Posts", valor: posts },
    {
      icone: MessageSquare,
      rotulo: comentarios === 1 ? "Comentário" : "Comentários",
      valor: comentarios,
    },
    { icone: Star, rotulo: favoritos === 1 ? "Favorito" : "Favoritos", valor: favoritos },
    { icone: Users, rotulo: seguidores === 1 ? "Seguidor" : "Seguidores", valor: seguidores },
  ]

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3",
        className
      )}
    >
      {itens.map((item) => {
        const Icone = item.icone
        return (
          <div
            key={item.rotulo}
            className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/60 px-3 py-2.5"
          >
            <Icone
              className={cn("size-4", item.tom ?? "text-muted-foreground")}
              {...(item.preenchido ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
            />
            <span className={cn("text-lg font-bold leading-none", item.tom ?? "text-foreground")}>
              {formatCount(item.valor)}
            </span>
            <span className="text-[11px] leading-none text-muted-foreground">{item.rotulo}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Reexportado para o header não precisar duplicar a regra de milhar. */
export { formatCount }
