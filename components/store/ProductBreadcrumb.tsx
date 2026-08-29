"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ChevronRight, Store } from "lucide-react"

import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"

interface ProductBreadcrumbProps {
  productName: string
  category: string | null
  brand: string | null
  className?: string
}

/**
 * Trilha da página de produto: Loja › Categoria › Marca › Produto.
 *
 * Substitui o antigo "← Voltar à loja" sem perder a função dele — o primeiro
 * item é um botão de voltar de verdade (`router.back()`), então quem chegou
 * pela busca ou por uma listagem filtrada volta pro lugar exato de onde saiu,
 * enquanto os crumbs seguintes dão os atalhos "subir um nível" que o link
 * único não dava. Quem entrou direto (compartilhamento, Google) não tem
 * histórico útil, então o botão também é um `<a href="/loja">`: clique normal
 * navega pro histórico, e ctrl/cmd+clique abre a Loja em outra aba.
 *
 * A categoria carrega o mesmo ícone tintado dos tiles/menu da Loja, o que dá
 * reconhecimento imediato do "onde estou" antes de ler o texto.
 */
export function ProductBreadcrumb({ productName, category, brand, className }: ProductBreadcrumbProps) {
  const router = useRouter()
  const categoryLabel = getCategoryLabel(category)
  const { icon: CategoryIcon, tint } = getCategoryIcon(category)

  const brandHref = brand
    ? category
      ? `/loja/marca/${encodeURIComponent(brand)}?categoria=${encodeURIComponent(category)}`
      : `/loja/marca/${encodeURIComponent(brand)}`
    : null

  /** Nível imediatamente acima do produto — é pra onde o "voltar" cai quando
   *  não há histórico (entrada direta pelo Google/link compartilhado). */
  const parentHref = brandHref ?? (category ? `/loja/categoria/${encodeURIComponent(category)}` : "/loja")

  return (
    <nav
      aria-label="Você está em"
      className={cn(
        "group/crumbs mb-5 flex items-center gap-1 text-[12.5px]",
        className
      )}
    >
      <a
        href={parentHref}
        onClick={(event) => {
          // Deixa passar os cliques que o usuário quer em outra aba/janela.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
          if (window.history.length > 1) {
            event.preventDefault()
            router.back()
          }
        }}
        aria-label="Voltar"
        className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-muted/25 pl-2 pr-2.5 font-semibold text-muted-foreground transition-all hover:border-foreground/25 hover:bg-muted/50 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 shrink-0 transition-transform duration-200 group-hover/crumbs:-translate-x-0.5" />
        {/* Em telas pequenas o botão fica só com a seta; a partir de sm o
            rótulo aparece e a trilha completa assume a orientação. */}
        <Store className="size-3.5 shrink-0 sm:hidden" />
        <span className="hidden sm:inline">Loja</span>
      </a>

      {category && (
        <>
          <ChevronRight className="size-3.5 shrink-0 text-border" />
          <Link
            href={`/loja/categoria/${encodeURIComponent(category)}`}
            className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 font-semibold text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted/40 hover:text-foreground"
          >
            <CategoryIcon className="size-3.5 shrink-0" style={{ color: tint }} strokeWidth={1.8} />
            {categoryLabel}
          </Link>
        </>
      )}

      {brand && brandHref && (
        <>
          {/* A marca some no mobile: com o nome do produto na sequência, os
              quatro níveis não cabem em 360px sem virar reticência inútil. */}
          <ChevronRight className="hidden size-3.5 shrink-0 text-border sm:block" />
          <Link
            href={brandHref}
            className="hidden h-[30px] shrink-0 items-center rounded-full border border-transparent px-2.5 font-semibold text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted/40 hover:text-foreground sm:inline-flex"
          >
            {brand}
          </Link>
        </>
      )}

      <ChevronRight className="size-3.5 shrink-0 text-border" />
      <span
        aria-current="page"
        className="min-w-0 truncate px-1 font-semibold text-foreground/70"
        title={productName}
      >
        {productName}
      </span>
    </nav>
  )
}
