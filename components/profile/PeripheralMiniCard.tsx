"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"

import { StarRating } from "@/components/ui/star-rating"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

/**
 * Card de periférico do perfil — **o** card, usado pelas três seções: "Meu
 * setup", "Periféricos favoritos" e "Meus Reviews".
 *
 * A estrutura é fixa, de cima para baixo: foto numa caixa clara centralizada,
 * nome em negrito e, abaixo de um filete, as estrelas com a contagem de
 * reviews da comunidade embaixo. Sem preço e sem a foto de quem deu a nota:
 * o card só aparece no perfil da própria pessoa, então a foto dela repetida
 * em cada card era ruído, e o preço do catálogo não é o assunto da review. As três seções desenham exatamente isso — antes cada
 * uma tinha o seu card (foto de 64px aqui, `aspect-square` ali, borda e
 * padding diferentes em cada) e o perfil parecia três telas coladas.
 *
 * Quem enfeita por fora: o slot do setup passa `header`, o dono passa
 * `actions` (editar/excluir), e o tooltip do catálogo continua sendo
 * responsabilidade de quem usa o card.
 *
 * "Meu setup" e "Periféricos favoritos" passam `showDetails={false}`: lá o
 * card é só foto e nome. A nota fica para "Meus Reviews", que é onde a
 * classificação é o assunto.
 */

/** Altura da caixa da foto. Único número a mexer para o card inteiro acompanhar. */
const IMAGE_BOX = "h-20"

interface PeripheralMiniCardProps {
  peripheral: ShowcasePeripheral
  /** Nota do DONO do perfil neste periférico (a review dele); sem ela, a média da comunidade. */
  rating?: number | null
  /** Faixa acima da foto — o rótulo do slot no "Meu setup". */
  header?: ReactNode
  /** Botões do dono, posicionados sobre o card (`absolute`). */
  actions?: ReactNode
  /** Link próprio; por padrão vai para a ficha do periférico. */
  href?: string
  /** `false` esconde o rodapé de nota. */
  showDetails?: boolean
  className?: string
}

/** "12 reviews" · "1 review" · "Sem reviews ainda" — texto do rodapé. */
export function reviewCountLabel(count: number): string {
  if (count <= 0) return "Sem reviews ainda"
  return `${count} review${count === 1 ? "" : "s"}`
}

/** "4" · "4,5" · "4,3" — sem a casa decimal quando ela não diz nada. */
function ratingLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",")
}

export function PeripheralMiniCard({
  peripheral,
  rating,
  header,
  actions,
  href,
  showDetails = true,
  className,
}: PeripheralMiniCardProps) {
  const target = href ?? `/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`
  const shownRating = rating ?? peripheral.reviews.average

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-card",
        className
      )}
    >
      {header}

      <Link
        href={target}
        className={cn(
          "relative mx-auto block w-full max-w-28 shrink-0",
          IMAGE_BOX
        )}
      >
        {peripheral.image_url ? (
          <Image
            src={peripheral.image_url}
            alt={peripheral.name}
            fill
            sizes="(min-width: 1024px) 120px, 40vw"
            className="object-contain p-1.5"
          />
        ) : null}
      </Link>

      <Link
        href={target}
        className="mt-3 block truncate text-sm font-semibold text-foreground hover:underline"
        title={peripheral.name}
      >
        {peripheral.name}
      </Link>

      {showDetails && (
        <div className="mt-2 border-t border-border/60 pt-2">
          {shownRating != null && (
            <div className="flex items-center gap-1.5">
              <StarRating value={shownRating} size="sm" className="gap-0" />
              <span className="text-[11px] font-semibold text-amber-400">
                {ratingLabel(shownRating)}
              </span>
            </div>
          )}
          <p className="truncate text-[11px] text-muted-foreground/70">
            {reviewCountLabel(peripheral.reviews.count)}
          </p>
        </div>
      )}

      {actions}
    </div>
  )
}

/** Mesma casca do card, sem periférico — slot vazio do setup e dos favoritos. */
export function PeripheralMiniCardEmpty({
  header,
  icon,
  label,
  showDetails = true,
  className,
}: {
  header?: ReactNode
  icon: ReactNode
  label: string
  /** Acompanha o `showDetails` do card cheio, para as alturas baterem. */
  showDetails?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-dashed border-border/60 bg-card/30 p-3",
        className
      )}
    >
      {header}
      <div
        className={cn(
          "mx-auto flex w-full max-w-28 items-center justify-center rounded-md bg-muted/20 text-muted-foreground/25",
          IMAGE_BOX
        )}
      >
        {icon}
      </div>
      <p className="mt-3 truncate text-sm font-semibold text-muted-foreground/50">{label}</p>
      {showDetails && (
        <div className="mt-2 border-t border-border/40 pt-2">
          <p className="text-[11px] text-transparent">&nbsp;</p>
          <p className="text-[11px] text-transparent">&nbsp;</p>
        </div>
      )}
    </div>
  )
}
