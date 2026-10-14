import { StoreBypassNotice } from "@/components/store/StoreBypassNotice"
import { StoreCommerceBarProvider } from "@/components/store/StoreCommerceBarContext"
import { storeCardPaymentsEnabled } from "@/lib/server/payments/gateway"
import { getStoreCommerceBar } from "@/lib/server/repositories/store-commerce-bar-repository"
import { benefitsForPaymentMethods } from "@/lib/store-commerce-bar"

/** Configuração + o relógio do servidor no momento da leitura (para a hidratação decidir o modo igual). */
async function loadCommerceBar() {
  const saved = await getStoreCommerceBar()
  // Benefício de cartão só aparece com cartão ligado (gateway ativo). Filtrado
  // aqui, no servidor, para a barra já sair certa no HTML, sem piscar.
  const config = {
    ...saved,
    benefits: benefitsForPaymentMethods(saved.benefits, { cardEnabled: storeCardPaymentsEnabled() }),
  }
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
      <StoreBypassNotice />
      {children}
    </StoreCommerceBarProvider>
  )
}
