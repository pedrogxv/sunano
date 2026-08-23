import "server-only"

/**
 * Cliente Asaas — SERVIDOR APENAS.
 *
 * Usa `ASAAS_API_KEY`, que jamais pode chegar ao navegador. Ao contrário da
 * MisticPay, o Asaas exige um "customer" cadastrado antes de criar a
 * cobrança e o QR code PIX é obtido numa chamada separada. Docs:
 * https://docs.asaas.com/
 */
const BASE_URL =
  process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3"

function getApiKey() {
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new Error("ASAAS_API_KEY não configurada.")
  return key
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: getApiKey(),
      "User-Agent": "Sunano/1.0.0",
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Asaas ${path} falhou (${res.status}): ${text}`)
  }

  return res.json() as Promise<T>
}

export interface FindOrCreateCustomerParams {
  name: string
  cpfCnpj: string
  email?: string | null
  // Exigidos pela Asaas só para o Checkout hospedado (cartão) — PIX direto
  // (createPixPayment) funciona sem eles, por isso ficam opcionais aqui.
  phone?: string | null
  postalCode?: string | null
  address?: string | null
  addressNumber?: string | null
  complement?: string | null
  province?: string | null // bairro, no vocabulário da Asaas — não é UF
  city?: string | null
  state?: string | null // UF (sigla), campo separado de `province`
}

export interface AsaasCustomer {
  id: string
}

/**
 * Busca um customer existente pelo CPF (evita duplicar cadastro no painel
 * Asaas quando o cache em `user_profiles.asaas_customer_id` não tem o dado
 * — ex.: guest checkout recorrente com o mesmo CPF) e cria um novo se não
 * encontrar.
 *
 * Se o customer já existir mas faltar phone/address (ex.: criado antes num
 * checkout PIX, que não exige esses campos) e o chamador estiver passando
 * esses dados agora (checkout de cartão), atualiza o cadastro na Asaas via
 * PUT — senão o createCheckout falha com "campo X deve existir para o
 * customer informado" mesmo com os dados corretos sendo enviados aqui.
 */
export async function findOrCreateCustomer(params: FindOrCreateCustomerParams): Promise<AsaasCustomer> {
  const existing = await asaasFetch<{ data: (AsaasCustomer & { phone?: string; address?: string })[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(params.cpfCnpj)}`
  )
  if (existing.data.length > 0) {
    const customer = existing.data[0]
    const needsAddressUpdate =
      params.phone && params.address && (!customer.phone || !customer.address)
    if (needsAddressUpdate) {
      return asaasFetch<AsaasCustomer>(`/customers/${encodeURIComponent(customer.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: params.name,
          email: params.email ?? undefined,
          phone: params.phone ?? undefined,
          postalCode: params.postalCode ?? undefined,
          address: params.address ?? undefined,
          addressNumber: params.addressNumber ?? undefined,
          complement: params.complement ?? undefined,
          province: params.province ?? undefined,
          city: params.city ?? undefined,
          state: params.state ?? undefined,
        }),
      })
    }
    return customer
  }

  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      cpfCnpj: params.cpfCnpj,
      email: params.email ?? undefined,
      phone: params.phone ?? undefined,
      postalCode: params.postalCode ?? undefined,
      address: params.address ?? undefined,
      addressNumber: params.addressNumber ?? undefined,
      complement: params.complement ?? undefined,
      province: params.province ?? undefined,
      city: params.city ?? undefined,
      state: params.state ?? undefined,
    }),
  })
}

export interface CreatePixPaymentParams {
  customerId: string
  amountCents: number
  description?: string
  externalReference: string
}

export interface AsaasPayment {
  id: string
  status: string
}

/**
 * Cria a cobrança PIX. `dueDate` é obrigatório pela API mas, para PIX, só
 * define o vencimento do QR code (hoje mesmo — cobrança à vista).
 */
export async function createPixPayment(params: CreatePixPaymentParams): Promise<AsaasPayment> {
  const dueDate = new Date().toISOString().slice(0, 10)

  return asaasFetch<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: params.customerId,
      billingType: "PIX",
      value: params.amountCents / 100,
      dueDate,
      description: params.description,
      externalReference: params.externalReference,
    }),
  })
}

export interface PixQrCode {
  encodedImage: string
  payload: string
  expirationDate: string
}

export async function getPixQrCode(paymentId: string): Promise<PixQrCode> {
  const result = await asaasFetch<PixQrCode>(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`)
  return {
    ...result,
    // Asaas devolve só o base64 cru; a MisticPay já devolve um data URI
    // completo, então normalizamos aqui para os dois terem o mesmo contrato
    // (consumido direto por <img src>).
    encodedImage: `data:image/png;base64,${result.encodedImage}`,
    // Asaas devolve "2022-06-24 23:59:59" (sem fuso, sem "T") — normaliza para
    // ISO 8601 antes de gravar em coluna timestamptz.
    expirationDate: result.expirationDate.replace(" ", "T") + "-03:00",
  }
}

export interface CreateCheckoutParams {
  customerId: string
  totalCents: number // já com o acréscimo do cartão aplicado (ver store-settings-repository)
  description: string
  externalReference: string
  maxInstallments: number // de store_settings.card_max_installments, 1-6
  successUrl: string
  cancelUrl: string
  expiredUrl: string
  minutesToExpire: number
}

export interface AsaasCheckout {
  id: string
  link: string
  status: string
}

/**
 * Cria uma página de checkout HOSPEDADA PELA PRÓPRIA ASAAS (Asaas Checkout,
 * `/v3/checkouts` — produto diferente de `createPixPayment`/`invoiceUrl`).
 * O cliente digita os dados do cartão no domínio da Asaas: nosso backend
 * nunca recebe número de cartão, validade ou CVV. É o único caminho de
 * cartão de crédito aceito no projeto — deliberado por segurança (menor
 * escopo de PCI possível, equivalente a SAQ-A). Nunca adicionar aqui (ou em
 * qualquer outro lugar) uma função que receba dados crus de cartão no
 * nosso servidor.
 *
 * Aceita PIX e cartão na mesma página (`billingTypes`), então mesmo quem
 * escolhe "cartão" no nosso checkout pode voltar atrás e pagar via PIX lá —
 * o `payment_method` gravado no pedido reflete a intenção no momento da
 * criação, o webhook de confirmação (`CHECKOUT_PAID`) é que decide de fato.
 */
export async function createCheckout(params: CreateCheckoutParams): Promise<AsaasCheckout> {
  const useInstallments = params.maxInstallments > 1
  // DETACHED (cobrança única) é obrigatório sempre que PIX está entre os
  // billingTypes, e INSTALLMENT só é aceito em conjunto com DETACHED (não
  // sozinho) — confirmado contra a API real em sandbox, a doc não deixa
  // isso claro. Ou seja: nunca enviar só ["INSTALLMENT"].
  const chargeTypes = useInstallments ? ["DETACHED", "INSTALLMENT"] : ["DETACHED"]
  return asaasFetch<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes,
      ...(useInstallments && { installment: { maxInstallmentCount: params.maxInstallments } }),
      minutesToExpire: params.minutesToExpire,
      externalReference: params.externalReference,
      customer: params.customerId,
      items: [{ name: params.description, quantity: 1, value: params.totalCents / 100 }],
      callback: {
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        expiredUrl: params.expiredUrl,
      },
    }),
  })
}


export interface CreateSubscriptionCheckoutParams {
  customerId: string
  amountCents: number
  description: string
  externalReference: string
  nextDueDate: string // YYYY-MM-DD, vencimento da 1ª cobrança
  successUrl: string
  cancelUrl: string
  expiredUrl: string
  minutesToExpire: number
}

/**
 * Cria uma página de checkout HOSPEDADA PELA ASAAS para uma ASSINATURA
 * recorrente (mesmo produto de `createCheckout`, `/v3/checkouts`, mas com
 * `chargeTypes: ["RECURRENT"]` + um objeto `subscription`). Confirmado
 * contra a documentação oficial da Asaas (schema OpenAPI de
 * `POST /v3/checkouts`) que este endpoint aceita vínculo com assinatura sem
 * o backend nunca receber dado de cartão — o cliente digita tudo na página
 * hospedada, igual ao fluxo de cartão avulso já usado na loja.
 *
 * A resposta síncrona NÃO traz o `subscription.id` real — ele só existe
 * depois que o cliente paga a 1ª cobrança na página hospedada. O vínculo
 * inicial é feito por `externalReference` (nosso `vip_subscriptions.id`); o
 * `asaas_subscription_id` real é obtido depois, no webhook `CHECKOUT_PAID`,
 * via `getPaymentsByCheckoutSession` → `payment.subscription`.
 */
export async function createSubscriptionCheckout(
  params: CreateSubscriptionCheckoutParams
): Promise<AsaasCheckout> {
  return asaasFetch<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      subscription: { cycle: "MONTHLY", nextDueDate: params.nextDueDate },
      minutesToExpire: params.minutesToExpire,
      externalReference: params.externalReference,
      customer: params.customerId,
      items: [{ name: params.description, quantity: 1, value: params.amountCents / 100 }],
      callback: {
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        expiredUrl: params.expiredUrl,
      },
    }),
  })
}

export interface AsaasSubscription {
  id: string
  status: string
}

/** Reconsulta o status de uma assinatura na origem — defesa em profundidade antes de renovar via webhook. */
export async function getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`)
}

/**
 * Cancela a assinatura na Asaas (`DELETE /v3/subscriptions/{id}`) — chamada
 * pelo endpoint `POST /api/vip/cancel`, ação direta do usuário (não espera
 * webhook). Não estorna a cobrança já paga do ciclo atual: o acesso
 * continua válido até `vip_expires_at`, mesmo padrão de qualquer assinatura.
 */
export async function cancelSubscription(subscriptionId: string): Promise<AsaasDeleteResult> {
  return asaasFetch<AsaasDeleteResult>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
  })
}

export interface AsaasPaymentRefund {
  status: string
  value: number
  dateCreated: string
  description: string | null
}

export interface AsaasPaymentStatus {
  id: string
  status: string
  // Preenchido quando o payment pertence a uma assinatura recorrente
  // (subscription) — é assim que descobrimos o `asaas_subscription_id` real
  // após o primeiro pagamento de um checkout com chargeTypes: ["RECURRENT"],
  // já que a criação do checkout não retorna esse ID (só existe depois que
  // o cliente paga na página hospedada). Ver `getPaymentsByCheckoutSession`.
  subscription?: string | null
  checkoutSession?: string | null
  value?: number
  // `transactionReceiptUrl` só vem preenchido depois que o PIX é recebido —
  // é o comprovante da transação em si. `invoiceUrl` é a fatura hospedada no
  // Asaas e existe desde a criação da cobrança; usamos como fallback.
  transactionReceiptUrl?: string | null
  invoiceUrl?: string | null
  // Presente quando há (ou já houve) estorno na cobrança — cada entrada tem
  // seu próprio `status` (PENDING/DONE/CANCELLED/...), então um estorno
  // cancelado no painel Asaas não vira dinheiro estornado: precisamos somar
  // só os `DONE` para saber o valor efetivamente devolvido.
  refunds?: AsaasPaymentRefund[]
}

/**
 * Consulta o status real de uma cobrança direto no Asaas. O webhook já é
 * autenticado via header `asaas-access-token` (ao contrário da MisticPay,
 * que não assina nada), mas reconsultamos aqui mesmo assim antes de liberar
 * o pedido — mesma defesa em profundidade: um token de webhook vazado não
 * basta para forjar um pagamento se o handler sempre confirma na origem.
 */
export async function getPayment(paymentId: string): Promise<AsaasPaymentStatus> {
  return asaasFetch<AsaasPaymentStatus>(`/payments/${encodeURIComponent(paymentId)}`)
}

/**
 * Busca o(s) payment(s) gerado(s) por um Asaas Checkout hospedado.
 * Necessário porque `GET /v3/checkouts/{id}` não existe na API v3 (retorna
 * 404 mesmo pago), então o único jeito de obter o `paymentId`/
 * `transactionReceiptUrl`/`subscription` de uma cobrança de checkout é
 * consultar os payments do cliente e filtrar pelo `checkoutSession`.
 *
 * O filtro `?checkoutSession=` documentado pela Asaas (`/v3/payments?checkoutSession=`)
 * não funciona no sandbox — confirmado manualmente contra a API: um payment
 * com `checkoutSession` idêntico ao buscado aparece normalmente ao listar
 * por `customer`, mas o filtro por `checkoutSession` sempre devolve
 * `data: []`. Por isso filtramos por `customer` (funciona) e comparamos
 * `checkoutSession` no cliente.
 */
export async function getPaymentsByCheckoutSession(
  checkoutId: string,
  customerId: string
): Promise<AsaasPaymentStatus[]> {
  const result = await asaasFetch<{ data: AsaasPaymentStatus[] }>(
    `/payments?customer=${encodeURIComponent(customerId)}`
  )
  return result.data.filter((payment) => payment.checkoutSession === checkoutId)
}

export interface AsaasRefund {
  dateCreated: string
  status: string
  value: number
  description: string | null
}

export interface AsaasRefundResult {
  id: string
  status: string
  refunds: AsaasRefund[]
}

/**
 * Estorna uma cobrança PIX já recebida — integral (sem `valueCents`) ou
 * parcial. PIX na Asaas aceita múltiplos estornos parciais até o total da
 * cobrança; taxas de compensação/notificação não são devolvidas. Docs:
 * https://docs.asaas.com/reference/estornar-cobranca
 */
export async function refundPayment(
  paymentId: string,
  params?: { valueCents?: number; description?: string }
): Promise<AsaasRefundResult> {
  return asaasFetch<AsaasRefundResult>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify({
      value: params?.valueCents !== undefined ? params.valueCents / 100 : undefined,
      description: params?.description,
    }),
  })
}

export interface AsaasDeleteResult {
  deleted: boolean
  id: string
}

/**
 * Remove/cancela uma cobrança ainda não paga. Só faz sentido para cobranças
 * `PENDING` (nosso único uso: pedido aguardando pagamento) — a própria Asaas
 * não trata isso como substituto de estorno para cobranças já pagas. Docs:
 * https://docs.asaas.com/reference/remover-cobranca
 */
export async function cancelPayment(paymentId: string): Promise<AsaasDeleteResult> {
  return asaasFetch<AsaasDeleteResult>(`/payments/${encodeURIComponent(paymentId)}`, {
    method: "DELETE",
  })
}
