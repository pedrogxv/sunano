/**
 * Dados de compra salvos no perfil: COBRANÇA (titular do pagamento) e a
 * última ENTREGA usada. É o contrato que `getPurchaseProfile` devolve e que
 * o checkout (`/api/store/checkout/payer-info`) e Minha conta
 * (`/api/profile/purchase-data`) leem — as duas telas editam os mesmos
 * campos com os mesmos formulários (`PayerFields`, `ShippingAddressFields`).
 *
 * Cobrança e entrega são colunas separadas de propósito: comprar para
 * presentear não pode trocar o endereço do dono do cartão.
 */
export interface PurchaseProfile {
  payer: {
    fullName: string | null
    cpf: string | null
    phone: string | null
    postalCode: string | null
    street: string | null
    number: string | null
    complement: string | null
    neighborhood: string | null
    city: string | null
    state: string | null
  }
  shipping: {
    recipient: string | null
    cpf: string | null
    /** "AAAA-MM-DD". Só existe na entrega: a cobrança não guarda nascimento. */
    birthDate: string | null
    residenceType: string | null
    phone: string | null
    postalCode: string | null
    street: string | null
    number: string | null
    complement: string | null
    neighborhood: string | null
    city: string | null
    state: string | null
  }
}
