"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"

import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { SunanoIcon } from "@/components/ui/SunanoLogo"
import { StarRating } from "@/components/ui/star-rating"
import { formatCurrencyBRL } from "@/lib/format"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

/**
 * Card de periférico do perfil — **o** card, usado pelas três seções: "Meu
 * setup", "Periféricos favoritos" e "Meus Reviews".
 *
 * A estrutura é fixa, de cima para baixo: foto numa caixa clara centralizada,
 * nome em negrito, linha de preço com um filete abaixo dela e, no rodapé, a
 * foto de quem deu a nota ao lado das estrelas, com a contagem de reviews da
 * comunidade embaixo. As três seções desenham exatamente isso — antes cada
 * uma tinha o seu card (foto de 64px aqui, `aspect-square` ali, borda e
 * padding diferentes em cada) e o perfil parecia três telas coladas.
 *
 * Quem enfeita por fora: o slot do setup passa `header`, o dono passa
 * `actions` (editar/excluir), e o tooltip do catálogo continua sendo
 * responsabilidade de quem usa o card.
 */

/** Altura da caixa da foto. Único número a mexer para o card inteiro acompanhar. */
const IMAGE_BOX = "h-20"

/** Quem deu a nota — o dono do perfil. Ver `profileFrameOf` em `lib/profile-frames.ts`. */
export type MiniCardAuthor = {
  name: string
  avatarUrl: string | null
  /** Moldura em UM objeto, como manda o `AGENTS.md` — nunca tier/VIP soltos. */
  frame: ProfileFrameIdentity | null
}

interface PeripheralMiniCardProps {
  peripheral: ShowcasePeripheral
  /**
   * Nota do DONO do perfil neste periférico (a review dele). Com ela o rodapé
   * mostra a foto dele ao lado das estrelas; sem ela, o card cai na média da
   * comunidade e o avatar não aparece — pôr a foto de alguém ao lado de uma
   * nota que não é dele seria dizer que ele a deu.
   */
  rating?: number | null
  /** Dono do perfil, para a foto do rodapé. */
  author?: MiniCardAuthor
  /** Faixa acima da foto — o rótulo do slot no "Meu setup". */
  header?: ReactNode
  /** Botões do dono, posicionados sobre o card (`absolute`). */
  actions?: ReactNode
  /** Link próprio; por padrão vai para a ficha do periférico. */
  href?: string
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

/** `0` é o "não sei o preço" do catálogo — ver o campo em `ShowcasePeripheral`. */
function priceLabel(price: number): string {
  return price > 0 ? formatCurrencyBRL(price) : "Preço não disponível"
}

export function PeripheralMiniCard({
  peripheral,
  rating,
  author,
  header,
  actions,
  href,
  className,
}: PeripheralMiniCardProps) {
  const target = href ?? `/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`
  const isOwnRating = rating != null
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
          "relative mx-auto block w-full max-w-28 shrink-0 rounded-md bg-muted/40",
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

      <p className="mt-1.5 truncate border-b border-border/60 pb-1.5 text-[11px] text-muted-foreground/80">
        {priceLabel(peripheral.price)}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {/* Quem assina a nota. A foto da pessoa só aparece quando a nota é
            DELA; quando é a média da comunidade quem assina é o site, senão o
            card diria que ela deu uma nota que não deu. */}
        {shownRating != null &&
          (isOwnRating && author ? (
            <ProfileAvatar
              name={author.name}
              avatarUrl={author.avatarUrl}
              frame={author.frame}
              size="sm"
              wrapperClassName="shrink-0"
            />
          ) : (
            <SunanoIcon
              className="size-8 shrink-0 rounded-full bg-muted/40 p-0.5"
              title="Média da comunidade"
            />
          ))}

        <div className="min-w-0">
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
      </div>

      {actions}
    </div>
  )
}

/** Mesma casca do card, sem periférico — slot vazio do setup e dos favoritos. */
export function PeripheralMiniCardEmpty({
  header,
  icon,
  label,
  className,
}: {
  header?: ReactNode
  icon: ReactNode
  label: string
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
      <p className="mt-1.5 border-b border-border/40 pb-1.5 text-[11px] text-transparent">&nbsp;</p>
      <p className="mt-2 truncate text-[11px] text-transparent">&nbsp;</p>
    </div>
  )
}
