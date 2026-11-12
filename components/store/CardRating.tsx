import { StarRating } from "@/components/ui/star-rating"
import type { StoreCardRating } from "@/lib/server/repositories/store-repository"

/**
 * Nota com uma casa ("4,8") e quantidade, a mesma linha em todo card da Loja
 * (`ProductCard` e `LaunchCard`).
 *
 * Sem avaliação: `reserveSpace` mantém a altura da linha (grade comum, para os
 * cards vizinhos não desalinharem); sem ele, não desenha nada.
 */
export function CardRating({ rating, reserveSpace = false }: { rating: StoreCardRating | null; reserveSpace?: boolean }) {
  if (!rating) return reserveSpace ? <div className="h-4" aria-hidden /> : null
  const average = rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <div className="flex h-4 items-center gap-1.5 text-[11px] leading-none">
      <StarRating value={Math.round(rating.average * 2) / 2} size="sm" className="gap-px" />
      <span className="font-bold text-white">{average}</span>
      <span className="text-[#7a7a7a]">({rating.count})</span>
    </div>
  )
}
