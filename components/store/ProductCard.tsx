"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, PackageX, ShoppingCart, SlidersHorizontal, Truck, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { markImageSettled } from "@/lib/image-settled"
import { cardActiveVariant, computeEffectivePrice, computeItemCardPriceCents, isCardSoldOut, isSinglePriceProduct } from "@/lib/store-pricing"
import { formatPreorderShipDate, PREORDER_STATUS_LABEL, PREORDER_STATUS_STYLE } from "@/lib/store-preorder"
import { LOW_STOCK_MAX_UNITS, STORE_CARD_BADGE, type StoreCardBadge } from "@/lib/store-card"
import { hasFreeShipping } from "@/lib/store-shipping"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { useCart } from "@/components/providers/cart-context"
import { Skeleton } from "@/components/ui/skeleton"
import { StarRating } from "@/components/ui/star-rating"
import { RouteLink } from "@/components/ui/route-link"
import { FavoriteButton } from "@/components/store/FavoriteButton"
import { PreorderCard } from "@/components/store/PreorderCard"
import { VariantPickerDialog } from "@/components/store/VariantPickerDialog"
import type { StoreCardRating, StoreProductCard } from "@/lib/server/repositories/store-repository"

const CONDITION_LABEL: Record<"new" | "used" | "opened", string> = {
  new: "Novo",
  used: "Usado",
  opened: "Emb. aberta",
}

type ProductCardProps = StoreProductCard & {
  /** `showcase`: cartão grande e mais vistoso, para seções com poucos itens (Serviços). */
  variant?: "default" | "showcase"
  /** Pede confirmação ao desfavoritar (lista de favoritos, onde o card some ao clicar). */
  confirmFavoriteRemoval?: boolean
}

/** O selo principal, no canto da foto. Cor, ícone e texto vêm de `STORE_CARD_BADGE`. */
function CardBadge({ badge, large }: { badge: StoreCardBadge; large?: boolean }) {
  const { label, icon: Icon, className } = STORE_CARD_BADGE[badge]
  return (
    <span
      className={cn(
        "absolute z-[1] flex max-w-[calc(100%-4rem)] items-center gap-1 rounded-lg font-bold shadow-md shadow-black/30",
        large ? "left-4 top-4 px-2.5 py-1.5 text-[11px]" : "left-2.5 top-2.5 px-2 py-1 text-[10px]",
        className
      )}
    >
      <Icon className={cn("shrink-0", large ? "size-3" : "size-2.5")} strokeWidth={2.5} />
      <span className="truncate">{label}</span>
    </span>
  )
}

/** Nota com uma casa ("4,8") e quantidade. Sem avaliação, a linha fica vazia, mas ocupa o espaço. */
function CardRating({ rating }: { rating: StoreCardRating | null }) {
  if (!rating) return <div className="h-4" aria-hidden />
  const average = rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <div className="flex h-4 items-center gap-1.5 text-[11px] leading-none">
      <StarRating value={Math.round(rating.average * 2) / 2} size="sm" className="gap-px" />
      <span className="font-bold text-white">{average}</span>
      <span className="text-[#7a7a7a]">({rating.count})</span>
    </div>
  )
}

/**
 * Até 3 características ("49g", "PAW3950", "8K"). Altura fixa de uma linha:
 * o que não cabe quebra para uma segunda linha escondida, em vez de sair
 * cortado no meio.
 */
function CardHighlights({ items }: { items: { label: string; tone?: "condition" }[] }) {
  return (
    <ul className="flex h-[22px] flex-wrap gap-1 overflow-hidden" aria-label="Características">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "flex h-[22px] items-center whitespace-nowrap rounded-md border px-1.5 text-[10.5px] font-semibold",
            item.tone === "condition"
              ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
              : "border-white/10 bg-white/[0.04] text-[#cfcfcf]"
          )}
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * O card de produto da Loja inteira. Pré-venda sai sempre no `PreorderCard`
 * (lote, previsão, quanto sobra, "Reservar na pré-venda"): antes só a seção da
 * Home o usava, e a mesma pré-venda aparecia com um card na Home e com outro
 * na listagem de categoria, marca, favoritos e busca. Decidir aqui, e não em
 * cada tela, é o que impede a próxima listagem de repetir a divergência.
 */
export function ProductCard(props: ProductCardProps) {
  if (props.sale_type === "pre_order" && props.variant !== "showcase") {
    return <PreorderCard {...props} confirmFavoriteRemoval={props.confirmFavoriteRemoval} />
  }
  return <StandardProductCard {...props} />
}

function StandardProductCard(props: ProductCardProps) {
  const showcase = props.variant === "showcase"
  const router = useRouter()
  const { add, setOpen: setCartOpen } = useCart()
  const { cardSurchargePercent, cardMaxInstallments } = useStoreSettings()
  const href = `/loja/${props.slug}`
  const variants = props.variants ?? []
  // Mesma variante e mesmo "esgotado" que o servidor usou para o selo e a
  // ordenação por preço (lib/store-pricing.ts).
  const activeVariant = cardActiveVariant(props)
  const [imageLoaded, setImageLoaded] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [justAdded])

  const soldOut = isCardSoldOut(props)
  // Lote fechado, cheio, "em breve" ou enviando: não há o que reservar agora.
  // O card fica no estado de indisponível, com o status do lote no lugar de
  // "Esgotado" (que seria mentira para "Novo lote em breve").
  const preorder = props.preorder
  const preorderUnavailable = !soldOut && preorder !== null && preorder.status !== "open"
  const outOfStock = soldOut || preorderUnavailable
  const unavailableLabel = preorderUnavailable && preorder ? PREORDER_STATUS_LABEL[preorder.status] : "Esgotado"
  const UnavailableIcon = preorderUnavailable && preorder ? PREORDER_STATUS_STYLE[preorder.status].icon : PackageX
  const singlePrice = isSinglePriceProduct(props)
  // A foto do produto manda; a da variante (cor/versão) só entra sem capa.
  const image = props.images?.[0] ?? activeVariant?.image_url ?? null
  const stock = activeVariant ? activeVariant.stock : props.stock
  const lowStock = !outOfStock && stock !== null && stock > 0 && stock <= LOW_STOCK_MAX_UNITS
  const isPreOrder = props.sale_type === "pre_order"
  const freeShipping = hasFreeShipping(props)
  // Mais de uma cor, ou um grupo de opção (Switch, Voltagem): o card não sabe
  // qual a pessoa quer, então o botão abre a escolha em vez de adivinhar.
  const requiresChoice = variants.length > 1 || props.has_option_groups

  // Mesma função usada pela página de produto e pelo checkout — o preço que
  // o card anuncia é, por construção, o preço que será cobrado.
  const {
    baseCents: basePriceCents,
    effectiveCents: effectivePriceCents,
    hasDiscount,
    discountPercent,
  } = computeEffectivePrice(props, activeVariant)

  const { icon: CategoryIcon, tint } = getCategoryIcon(props.category)
  const eyebrow = [getCategoryLabel(props.category), props.brand].filter(Boolean).join(" · ")
  // Estado de uso é característica: "Usado" entra como o primeiro item da
  // linha, no lugar de uma linha só para ele.
  const highlights = [
    ...(props.condition !== "new" ? [{ label: CONDITION_LABEL[props.condition], tone: "condition" as const }] : []),
    ...props.highlights.map((label) => ({ label })),
  ].slice(0, 3)

  function addToCart() {
    add({
      productId: props.id,
      variantId: activeVariant?.id ?? null,
      variantLabel: activeVariant?.label ?? null,
      variantColor: activeVariant?.color ?? null,
      variantIcon: activeVariant?.icon ?? null,
      variantOptions: [],
      slug: props.slug,
      name: props.name,
      priceCents: effectivePriceCents,
      image,
      stock,
      type: props.type,
      condition: props.condition,
      sale_type: props.sale_type,
      singlePrice,
    })
  }

  function handlePrimaryAction() {
    if (outOfStock) return
    if (requiresChoice) {
      setPickerOpen(true)
      return
    }
    addToCart()
    // Pré-venda é reserva: vai direto para o checkout, como "Reservar Agora"
    // na página do produto.
    if (isPreOrder) {
      router.push("/checkout")
      return
    }
    setJustAdded(true)
    setCartOpen(true)
  }

  const stockLine = outOfStock
    ? null
    : isPreOrder
      ? {
          text:
            preorder?.remaining != null
              ? `Restam ${preorder.remaining} no lote`
              : preorder?.shipsAt
                ? `Envio previsto: ${formatPreorderShipDate(preorder.shipsAt)}`
                : "Pré-venda: envio quando o lote chegar",
          tone: "text-amber-300",
          dot: "bg-amber-400",
        }
      : lowStock
        ? { text: `Últimas ${stock} unidades`, tone: "text-amber-300", dot: "bg-amber-400" }
        : {
            text: stock === null ? "Em estoque" : `Em estoque: ${stock} unidades`,
            tone: "text-emerald-300",
            dot: "bg-emerald-400",
          }

  const PrimaryIcon = justAdded ? Check : requiresChoice ? SlidersHorizontal : isPreOrder ? Zap : ShoppingCart
  const primaryLabel = justAdded ? "Adicionado" : requiresChoice ? "Escolher opções" : isPreOrder ? "Reservar" : "Adicionar"

  // O coração e as ações rápidas ficam FORA do link (botão dentro de <a> é
  // HTML inválido), então o hover que levanta o card mora no wrapper e cada
  // camada por cima sobe junto.
  return (
    <div className="group relative h-full hover:z-10">
      <Link href={href} className="flex h-full flex-col">
        <div className={cn(
          "relative z-0 flex h-full flex-col overflow-hidden border bg-card transition-[transform,border-color,box-shadow] duration-200",
          showcase
            ? "rounded-[26px] border-[#2c2c2c] bg-gradient-to-b from-[#1a1a1f] to-card group-hover:-translate-y-1.5 group-hover:border-violet-400/40 group-hover:shadow-[0_22px_60px_-24px_rgba(167,139,250,0.5)]"
            : "rounded-[18px] border-[#262626] group-hover:-translate-y-1 group-hover:border-white/25 group-hover:shadow-xl group-hover:shadow-black/40"
        )}>
          {/* Imagem sem placa própria: o fundo é o do card, então a foto (quase
              sempre PNG recortado em fundo branco) não fica dentro de um
              retângulo cinza destacado. O respiro da cor da categoria só
              aparece no fallback sem imagem, logo abaixo. No `showcase` a arte
              (pôster quadrado) ganha moldura arredondada com margem do card. */}
          <div className={cn(
            "relative aspect-square overflow-hidden",
            showcase ? "m-3 mb-0 rounded-[18px] bg-[radial-gradient(75%_65%_at_50%_40%,rgba(167,139,250,0.18),#141414_78%)]" : "bg-transparent"
          )}>
            {image ? (
              <>
                {imageLoaded !== image && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-emerald-500" />
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={image}
                  src={image}
                  alt={props.name}
                  ref={(el) => markImageSettled(el, () => setImageLoaded(image))}
                  onLoad={() => setImageLoaded(image)}
                  onError={() => setImageLoaded(image)}
                  className={cn(
                    "h-full w-full object-contain transition-[opacity,transform] duration-300 group-hover:scale-105",
                    !showcase && "p-3",
                    imageLoaded === image ? (outOfStock ? "opacity-45 grayscale" : "opacity-100") : "opacity-0"
                  )}
                />
              </>
            ) : (
              <div
                className={cn("flex h-full items-center justify-center", outOfStock && "opacity-50 grayscale")}
                style={{ background: `radial-gradient(120% 120% at 50% 15%, color-mix(in oklab, ${tint} 13%, #141414), #141414)` }}
              >
                <CategoryIcon
                  className="size-[108px] opacity-50 transition-transform duration-300 group-hover:scale-105"
                  style={{ color: tint }}
                  strokeWidth={1.15}
                />
              </div>
            )}

            {/* Um selo só, decidido no servidor (lib/store-card.ts). Esgotado
                já vem sem selo: a etiqueta abaixo é a única mensagem ali. */}
            {props.badge && <CardBadge badge={props.badge} large={showcase} />}

            {/* Selo de desconto some quando esgotou: debaixo do escurecido ele
                vira um vermelho sujo e disputa a atenção com a única
                informação que importa ali. O desconto continua dito pelo
                preço riscado, logo abaixo. */}
            {hasDiscount && !outOfStock && (
              <span className="absolute bottom-3 left-3 z-[1] rounded-lg bg-red-600 px-2 py-1 text-[11px] font-extrabold text-white">
                -{discountPercent}%
              </span>
            )}

            {/* Esgotado: a foto sai de cena (dessatura + escurece, logo acima) e a
                etiqueta fica em contraste cheio por cima. O card inteiro NÃO perde
                opacidade: era isso que deixava a própria etiqueta a 55% e o preço
                ilegível — a mensagem que mais precisa ser lida saía a mais fraca. */}
            {outOfStock && (
              <div className="absolute inset-0 z-[2] flex items-center justify-center bg-gradient-to-b from-black/25 via-black/45 to-black/65">
                <span className={cn(
                  "flex items-center gap-1.5 rounded-full border border-white/25 bg-black/75 font-display font-bold uppercase text-white shadow-lg shadow-black/60 backdrop-blur-[2px]",
                  showcase ? "gap-2 px-4 py-2 text-[12px] tracking-[0.2em]" : "px-3 py-1.5 text-[10.5px] tracking-[0.18em]"
                )}>
                  <UnavailableIcon className={showcase ? "size-3.5" : "size-3"} strokeWidth={2.5} />
                  {unavailableLabel}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className={cn(
            "flex flex-1 flex-col",
            showcase ? "gap-2.5 px-5 pb-5 pt-4" : "gap-1.5 px-[15px] pb-3.5 pt-3",
            outOfStock && "opacity-70"
          )}>
            {/* Altura fixa mesmo sem categoria, pra não desalinhar o card com os vizinhos. */}
            <p className={cn(
              "truncate font-bold uppercase text-[#7a7a7a]",
              showcase ? "text-[10.5px] tracking-[0.16em] text-violet-300/70" : "text-[9.5px] tracking-[0.14em]"
            )}>
              {eyebrow || "\u00a0"}
            </p>
            {/* `font-sans tracking-normal` desfaz o reset global de h3 (Space
                Grotesk + tracking negativo): no mock o nome do produto é Manrope.
                `min-h` reserva 2 linhas sempre, pra não variar a altura entre nomes de 1 e 2 linhas. */}
            <h3 className={cn(
              "line-clamp-2 font-sans tracking-normal text-white",
              showcase
                ? "min-h-[52px] text-[19px] font-bold leading-[1.3]"
                : "min-h-[38px] text-[14.5px] font-semibold leading-[1.35]"
            )}>
              {props.name}
            </h3>

            <CardRating rating={props.rating} />
            {!showcase && <CardHighlights items={highlights} />}

            <div className={cn("mt-auto", showcase ? "pt-2" : "pt-1")}>
              {hasDiscount && (
                <p className={cn("leading-tight text-[#6e6e6e] line-through", showcase ? "text-[12.5px]" : "text-[11px]")}>
                  {formatBRL(basePriceCents)}
                </p>
              )}
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className={cn(
                  "font-display font-bold leading-tight text-white",
                  showcase ? "text-[32px]" : "text-xl"
                )}>
                  {formatBRL(effectivePriceCents)}
                  {singlePrice && <span aria-hidden="true">*</span>}
                </p>
                {!singlePrice && (
                  <span className={cn(
                    "font-semibold uppercase tracking-wide text-emerald-400/80",
                    showcase ? "text-[11px]" : "text-[9.5px]"
                  )}>no PIX</span>
                )}
              </div>
              {/* Serviço tem preço único: sem desconto de PIX, não há "ou X no cartão". */}
              <p className={cn("text-[#7a7a7a]", showcase ? "text-[12px]" : "text-[10px]")}>
                {singlePrice
                  ? `Mesmo preço no cartão${cardMaxInstallments > 1 ? `, em até ${cardMaxInstallments}x sem juros` : ""}`
                  : `ou ${formatBRL(computeItemCardPriceCents(effectivePriceCents, cardSurchargePercent, false))} no cartão${cardMaxInstallments > 1 ? ` em até ${cardMaxInstallments}x sem juros` : ""}`}
              </p>
              {singlePrice && (
                <p className={cn("text-[#7a7a7a]", showcase ? "text-[12px]" : "text-[10px]")}>
                  * Valor de consulta, não representa o valor final
                </p>
              )}
            </div>

            {/* Frete grátis tem destaque próprio (o checkout não cobra frete;
                ver lib/store-shipping.ts). A urgência de estoque fica do lado
                quando o selo da foto não é ela, senão diria a mesma coisa duas vezes. */}
            <div className="mt-1.5 flex h-6 items-center justify-between gap-2">
              {freeShipping ? (
                <span className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1 text-[12px] font-bold text-emerald-400">
                  <Truck className="size-3.5" strokeWidth={2.4} />
                  Frete grátis
                </span>
              ) : (
                <span />
              )}
              {lowStock && props.badge !== "low_stock" && (
                <span className="truncate text-[10px] font-semibold text-amber-400">Últimas {stock}!</span>
              )}
            </div>

            {showcase && (
              <span className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[13.5px] font-bold text-white transition-colors group-hover:border-transparent group-hover:bg-white group-hover:text-black">
                {outOfStock ? "Ver detalhes" : "Ver serviço"}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            )}
          </div>
        </div>
      </Link>
      <FavoriteButton
        productId={props.id}
        productName={props.name}
        confirmRemoval={props.confirmFavoriteRemoval}
        className={cn(
          "absolute z-[3] transition-transform duration-200",
          showcase ? "right-5 top-5 group-hover:-translate-y-1.5" : "right-2.5 top-2.5 group-hover:-translate-y-1"
        )}
      />

      {/* Ações rápidas (desktop): no rodapé da foto, só com o mouse em cima.
          O `hover` do Tailwind 4 só existe em aparelho com mouse, então no
          toque o card continua sendo um link só. `focus-within` abre para
          quem navega pelo teclado. O quadrado repete a geometria da foto,
          que não tem margem no card padrão. */}
      {!showcase && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] aspect-square transition-transform duration-200 group-hover:-translate-y-1">
          <div className="@container absolute inset-x-2.5 bottom-2.5 translate-y-1.5 rounded-xl border border-white/10 bg-[#0d0d0d]/90 p-2 opacity-0 shadow-xl shadow-black/50 backdrop-blur-md transition-[opacity,transform] duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100">
            {stockLine && (
              <p className={cn("mb-1.5 flex items-center gap-1.5 px-0.5 text-[10.5px] font-semibold", stockLine.tone)}>
                <span className={cn("size-1.5 shrink-0 rounded-full", stockLine.dot)} />
                <span className="truncate">{stockLine.text}</span>
              </p>
            )}
            {/* "Ver detalhes" ocupa só o próprio texto: o espaço que sobra é do
                botão principal, que tem o rótulo mais longo ("Escolher opções"). */}
            <div className={cn("grid gap-1.5", outOfStock ? "grid-cols-1" : "grid-cols-[auto_minmax(0,1fr)]")}>
              <RouteLink
                href={href}
                className="flex h-8 cursor-pointer items-center justify-center rounded-lg border border-white/15 px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-white/10"
              >
                Ver detalhes
              </RouteLink>
              {!outOfStock && (
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  aria-label={requiresChoice ? "Escolher opções" : isPreOrder ? "Reservar agora" : "Adicionar ao carrinho"}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[11.5px] font-bold transition-colors",
                    justAdded ? "bg-emerald-500 text-white" : "bg-white text-black hover:bg-emerald-400"
                  )}
                >
                  {/* Ícone só onde cabe junto do rótulo (carrossel do celular é mais estreito). */}
                  <PrimaryIcon className="hidden size-3.5 shrink-0 @[14.5rem]:block" strokeWidth={2.4} />
                  <span className="truncate">{primaryLabel}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {requiresChoice && (
        <VariantPickerDialog
          slug={props.slug}
          name={props.name}
          category={props.category}
          fallbackImage={image}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
      )}
    </div>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-[#262626] bg-card">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-1.5 px-[15px] pb-3.5 pt-3">
        <Skeleton className="h-2.5 w-2/5" />
        <Skeleton className="h-[38px] w-4/5" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-1">
          <Skeleton className="h-[22px] w-10" />
          <Skeleton className="h-[22px] w-16" />
          <Skeleton className="h-[22px] w-8" />
        </div>
        <Skeleton className="mt-auto h-5 w-1/2" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="mt-1.5 h-5 w-20" />
      </div>
    </div>
  )
}
