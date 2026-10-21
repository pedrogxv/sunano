import type { Metadata } from "next"
import { ShoppingBag } from "lucide-react"
import { getStoreProductDetail } from "@/lib/server/repositories/store-repository"
import { ComingSoon } from "@/components/store/ComingSoon"
import { StoreProductPageBody } from "@/components/store/StoreProductPageBody"
import {
  isStoreBrowsingBlockedForCachedRoute,
  storeMaintenanceMetadata,
} from "@/lib/server/auth/store-maintenance-gate"
import { getStoreLaunchAt } from "@/lib/store-maintenance"
import { buildDescription, buildMetadata } from "@/lib/seo"

export const revalidate = 120

// Sem isto o `revalidate` acima não valia: rota com segmento dinâmico e sem
// `generateStaticParams` é renderizada a CADA request. Medido em produção em
// 21/10/2026: `no-store`, MISS, 1,2–2,5 s por visita — a página mais visitada
// num lançamento consultava o banco uma vez por visitante. Lista vazia = cada
// produto é gerado na primeira visita e depois sai do cache (mesma correção
// de `/loja/categoria/[categoria]`). Quem invalida: o admin ao salvar
// (`revalidateStorefront`) e o checkout a cada compra que mexe no estoque
// (`revalidateStoreProducts`).
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ slug: string }>
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  used: "Usado",
  opened: "Aberto",
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params

  // Em manutenção esta rota renderiza a tela "Coming soon", igual a todas as
  // outras de `/loja/**`. `return {}` (o que havia aqui) herdava o
  // `index, follow` do layout raiz e oferecia ao Google uma URL por produto
  // com conteúdo idêntico. Sai do índice mantendo o `follow`.
  const maintenance = storeMaintenanceMetadata({
    title: "Loja",
    path: `/loja/${slug}`,
  })
  if (maintenance) return maintenance

  const detail = await getStoreProductDetail(slug)
  if (!detail) return {}

  const { product } = detail
  const priceCents = product.promo_price_cents ?? product.price_cents
  const price = (priceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
  const condition = CONDITION_LABEL[product.condition] ?? ""

  // Complemento de Pagamento não tem preço: o valor é o do pedido do cliente.
  if (product.is_payment_complement) {
    return buildMetadata({
      title: product.name,
      titleSuffix: " | Loja Sunano",
      description: buildDescription(product.description, product.name, {
        context: "Pague o valor pendente de um pedido da Loja Sunano pelo número do pedido.",
      }),
      path: `/loja/${slug}`,
      eyebrow: "Loja",
      subtitle: "Pagamento de pedido",
      image: product.images[0],
      imageVariant: "product",
    })
  }

  return buildMetadata({
    title: product.name,
    titleSuffix: " | Loja Sunano",
    // Sem descrição própria a página caía numa frase de 40 chars ("X —
    // disponível na Loja Sunano"), abaixo do mínimo útil de card. O
    // complemento carrega preço e condição, que é o que decide o clique.
    description: buildDescription(product.description, product.name, {
      context: `${condition} por ${price} na Loja Sunano.`,
      extraContext: "Testado antes de anunciar, com PIX na hora e envio para todo o Brasil.",
    }),
    path: `/loja/${slug}`,
    eyebrow: "Loja",
    subtitle: `${condition} · ${price}`,
    // `product` desenha a foto com `contain`: recortar foto de produto corta o
    // próprio produto. Antes ela ia crua em 800×800 (1:1) e saía distorcida.
    image: product.images[0],
    imageVariant: "product",
  })
}

export default async function ProductPage({ params }: PageProps) {
  // A página é a mesma para todo visitante (ISR), então não lê cookie: com a
  // Loja em manutenção, ela mostra "Coming soon" a todo mundo. Quem atravessa
  // a manutenção (WEB MASTER ou `store_access`) é servido pela cópia dinâmica
  // `app/loja/acesso-equipe/produto/[slug]`, por rewrite do proxy, sem mudar a
  // URL. Ver `isStoreBrowsingBlockedForCachedRoute`.
  if (isStoreBrowsingBlockedForCachedRoute()) {
    return (
      <ComingSoon
        icon={ShoppingBag}
        title="Loja"
        description="A Loja, com produtos selecionados pelo Sunano, está sendo preparada. Fique de olho nas redes para o lançamento."
        accent="emerald"
        launchAt={getStoreLaunchAt()}
      />
    )
  }

  const { slug } = await params
  return <StoreProductPageBody slug={slug} />
}
