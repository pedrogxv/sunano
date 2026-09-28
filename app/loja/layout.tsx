import { StoreCommerceBarProvider } from "@/components/store/StoreCommerceBarContext"
import { getStoreCommerceBar } from "@/lib/server/repositories/store-commerce-bar-repository"

/** Configuração + o relógio do servidor no momento da leitura (para a hidratação decidir o modo igual). */
async function loadCommerceBar() {
  const config = await getStoreCommerceBar()
  return { config, serverNow: Date.now() }
}

/**
 * A barra comercial (benefícios / campanha) aparece logo abaixo do menu em
 * TODA página da Loja. Ela é lida uma vez aqui e distribuída por contexto; o
 * painel invalida este layout inteiro ao salvar (revalidateStorefront).
 */
export default async function LojaLayout({ children }: { children: React.ReactNode }) {
  const { config, serverNow } = await loadCommerceBar()

  return (
    <StoreCommerceBarProvider config={config} serverNow={serverNow}>
      {children}
    </StoreCommerceBarProvider>
  )
}
