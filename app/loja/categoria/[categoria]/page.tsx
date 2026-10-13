import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { getCategoryLabel } from "@/lib/store-category-icons"
import { ShoppingBag } from "lucide-react"
import { ComingSoon } from "@/components/store/ComingSoon"
import { StoreCategoryPageBody } from "@/components/store/StoreCategoryPageBody"
import {
  isStoreBrowsingBlockedForCachedRoute,
  storeMaintenanceMetadata,
} from "@/lib/server/auth/store-maintenance-gate"
import { getStoreLaunchAt } from "@/lib/store-maintenance"

export const revalidate = 60

// Sem isto o `revalidate` acima não valia: rota com segmento dinâmico e sem
// `generateStaticParams` é renderizada a CADA request (produção respondia
// `no-store`, 1,6–2s por visita). Lista vazia = cada categoria é gerada na
// primeira visita e depois sai do cache, e o `<Link>` passa a pré-carregar a
// página inteira — a troca a partir da Home fica instantânea em vez de
// segurar a Home na tela até o servidor responder. `revalidateStorefront`
// (`revalidatePath("/loja", "layout")`) já invalida estas páginas ao salvar.
export function generateStaticParams() {
  return []
}

interface CategoriaPageProps {
  params: Promise<{ categoria: string }>
}

export async function generateMetadata({ params }: CategoriaPageProps): Promise<Metadata> {
  const { categoria } = await params
  const category = decodeURIComponent(categoria)
  const categoryLabel = getCategoryLabel(category)

  const maintenance = storeMaintenanceMetadata({
    title: "Loja",
    path: `/loja/categoria/${encodeURIComponent(category)}`,
  })
  if (maintenance) return maintenance

  return buildMetadata({
    title: `${categoryLabel} - Loja`,
    description: `Todos os produtos da categoria ${categoryLabel} na Loja Sunano: periféricos novos e usados testados antes de anunciar, com PIX na hora e envio para todo o Brasil.`,
    path: `/loja/categoria/${encodeURIComponent(category)}`,
    eyebrow: "Loja",
    subtitle: `Periféricos da categoria ${categoryLabel}`,
  })
}

export default async function LojaCategoriaPage({ params }: CategoriaPageProps) {
  // Mesma tela de manutenção de `/loja` — sem ela esta rota servia o catálogo
  // inteiro da categoria com HTTP 200 enquanto a Loja dizia "Coming soon".
  // Sem cookie: a rota é ISR (ver `isStoreBrowsingBlockedForCachedRoute`).
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

  const { categoria } = await params
  return <StoreCategoryPageBody category={decodeURIComponent(categoria)} />
}
