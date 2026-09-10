import "server-only"

import { PIX_EXPIRATION_MINUTES } from "@/lib/server/repositories/orders-repository"

/**
 * Cliente Asaas — SERVIDOR APENAS.
 *
 * Usa `ASAAS_API_KEY`, que jamais pode chegar ao navegador. O Asaas exige
 * um "customer" cadastrado antes de criar a cobrança, e o QR code PIX é
 * obtido numa chamada separada (fluxo de 3 requisições). Docs:
 * https://docs.asaas.com/
 */

/**
 * Ambiente do gateway. `ASAAS_ENV` é OBRIGATÓRIA e só aceita dois valores.
 *
 * Antes isto era `ASAAS_ENV === "production" ? prod : sandbox`, ou seja: env
 * ausente, com typo ou herdada de outro ambiente caía silenciosamente em
 * SANDBOX. Num deploy de produção esse default significa pagamento de mentira
 * liberando pedido de verdade — o pior modo de falha possível para uma loja,
 * e invisível, porque o checkout responde 200 e o webhook confirma.
 *
 * Agora a escolha é sempre explícita:
 *   • valor inválido/ausente  → erro (não há default "seguro" que sirva);
 *   • `sandbox` em produção   → erro (é o cenário perigoso acima);
 *   • `sandbox` fora de prod  → ok, é o modo de desenvolvimento normal.
 *
 * A validação roda no primeiro uso, não no import: assim `next build` e
 * qualquer rota que não cobre não quebram por causa de uma env de pagamento.
 */
function resolveBaseUrl(): string {
  const env = process.env.ASAAS_ENV?.trim().toLowerCase()

  if (env !== "production" && env !== "sandbox") {
    throw new Error(
      `ASAAS_ENV precisa ser "production" ou "sandbox" (recebido: ${
        process.env.ASAAS_ENV ? `"${process.env.ASAAS_ENV}"` : "ausente"
      }). Sem valor explícito o gateway cairia em sandbox e processaria pagamentos falsos como reais.`
    )
  }

  if (env === "sandbox" && process.env.VERCEL_ENV === "production") {
    throw new Error(
      "ASAAS_ENV=sandbox em deploy de produção — pagamentos de teste liberariam pedidos reais. Configure ASAAS_ENV=production."
    )
  }

  return env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3"
}

/**
 * Ambiente resolvido do gateway, para gravar no pedido (`store_orders.is_sandbox`).
 *
 * Mesma validação de `resolveBaseUrl` — de propósito: se a env está inválida
 * o checkout já ia falhar na primeira chamada ao gateway, e um pedido nunca
 * pode ser gravado com a marca de ambiente errada.
 */
export function isSandboxGateway(): boolean {
  return resolveBaseUrl().includes("sandbox")
}

function getApiKey() {
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new Error("ASAAS_API_KEY não configurada.")
  return key
}

/**
 * Erro de chamada à Asaas. Guarda o código/descrição estruturados do corpo
 * (`errors[0]`) porque vários 400 são regras de negócio legítimas — saldo
 * insuficiente para estorno, cobrança já estornada — e o admin precisa ver o
 * motivo real, não um "tente novamente" genérico.
 */
export class AsaasError extends Error {
  readonly status: number
  readonly code: string | null
  readonly description: string | null

  constructor(path: string, status: number, body: string) {
    let code: string | null = null
    let description: string | null = null
    try {
      const parsed = JSON.parse(body) as { errors?: Array<{ code?: string; description?: string }> }
      const first = parsed?.errors?.[0]
      if (first) {
        code = first.code ?? null
        description = first.description ?? null
      }
    } catch {
      // corpo não-JSON: só o texto cru na mensagem, abaixo
    }
    super(`Asaas ${path} falhou (${status}): ${body}`)
    this.name = "AsaasError"
    this.status = status
    this.code = code
    this.description = description
  }
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
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
    throw new AsaasError(path, res.status, text)
  }

  return res.json() as Promise<T>
}

/**
 * A Asaas valida `name` (e `description`) dos itens do Checkout com uma
 * lista curta de caracteres permitidos e responde 400
 * `parse_error: "O campo 'name' não pode conter caracteres especiais"` para
 * qualquer coisa fora dela. Na prática passam letras (com acento), dígitos,
 * espaço e a pontuação básica abaixo — símbolos comuns em nome de produto
 * (`|`, `/`, `—`, `+`, `&`, `#`, `%`, `*`, `®`, emoji) derrubam a chamada.
 *
 * Como o nome do produto é digitado livremente no admin, não dá para confiar
 * que ele seja aceitável: sanitiza aqui, no único ponto por onde todo
 * checkout passa, em vez de esperar disciplina no cadastro.
 *
 * A troca é textual, não semântica: separadores viram hífen (para "Teclado |
 * ABNT2" continuar legível como "Teclado - ABNT2"), o resto é removido, e os
 * espaços resultantes são colapsados. Se sobrar string vazia (nome só de
 * emoji, por exemplo), cai num rótulo genérico — melhor cobrar com o nome
 * feio do que não cobrar.
 */
export function sanitizeAsaasText(value: string, fallback = "Item"): string {
  const cleaned = value
    .normalize("NFC")
    // Separadores visuais viram hífen simples (que a Asaas aceita).
    .replace(/[|/\\—–_]+/g, "-")
    // Só o que a Asaas aceita: letras (incl. acentuadas), dígitos, espaço,
    // hífen, ponto, vírgula, parênteses e apóstrofo.
    .replace(/[^\p{L}\p{N} .,()'-]+/gu, " ")
    .replace(/\s+/g, " ")
    // Pontuação órfã nas pontas depois da limpeza ("Mouse -" → "Mouse").
    // Parênteses ficam de fora: "(P-M-G)" tem que manter o fecha-parêntese.
    .replace(/^[\s.,'-]+|[\s.,'-]+$/g, "")

  return cleaned || fallback
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
          name: sanitizeAsaasText(params.name, "Cliente"),
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
      name: sanitizeAsaasText(params.name, "Cliente"),
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
 * Cria a cobrança PIX. `dueDate` é obrigatório pela API e marca o vencimento
 * da COBRANÇA (hoje mesmo — à vista), mas não o do QR code: a Asaas devolve
 * `expirationDate` um ano à frente independente do `dueDate` (verificado na
 * API). Quem limita o prazo de verdade é `getPixQrCode`.
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

  // Asaas devolve "2022-06-24 23:59:59" (sem fuso, sem "T") — normaliza para
  // ISO 8601 antes de gravar em coluna timestamptz.
  const gatewayExpiration = new Date(result.expirationDate.replace(" ", "T") + "-03:00")

  // O prazo da Asaas é o do QR code, não o nosso: ela devolve um ano à frente
  // (o QR PIX dela é de longa validade, independente do `dueDate`). Quem
  // cancela o pedido e devolve o estoque é o cron, que usa
  // PIX_EXPIRATION_MINUTES — gravar o prazo cru fazia o cliente ver "expira em
  // 8781:12:43" e, pior, deixava o pedido pending pra sempre segurando
  // estoque, porque o cron filtra justamente por `pix_expires_at < now`.
  // Vale o que vencer primeiro.
  const ourExpiration = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000)
  const expiration =
    Number.isNaN(gatewayExpiration.getTime()) || gatewayExpiration > ourExpiration
      ? ourExpiration
      : gatewayExpiration

  return {
    ...result,
    // Asaas devolve só o base64 cru — normalizamos para um data URI completo,
    // consumido direto por <img src>.
    encodedImage: `data:image/png;base64,${result.encodedImage}`,
    expirationDate: expiration.toISOString(),
  }
}

export interface AsaasCheckoutItem {
  name: string
  quantity: number
  /** Valor UNITÁRIO em centavos, já no preço de cartão. */
  unitPriceCents: number
  description?: string | null
}

export interface CreateCheckoutParams {
  customerId: string
  totalCents: number // já com o acréscimo do cartão aplicado (ver store-settings-repository)
  /**
   * Itens exibidos na página hospedada da Asaas. A soma de
   * `quantity * unitPriceCents` TEM que fechar com `totalCents` — é a soma
   * dos itens que a Asaas cobra, `totalCents` serve de conferência aqui.
   */
  items: AsaasCheckoutItem[]
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
  // A Asaas cobra a SOMA dos itens, não `totalCents`. Se as duas contas
  // divergirem (arredondamento por item, item esquecido), o cliente pagaria
  // um valor diferente do que a nossa tela mostrou e do que o pedido gravou —
  // falha alto aqui em vez de cobrar errado.
  const itemsTotalCents = params.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  )
  if (itemsTotalCents !== params.totalCents) {
    throw new Error(
      `Asaas checkout: soma dos itens (${itemsTotalCents}) difere do total (${params.totalCents}).`
    )
  }

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
      items: params.items.map((item) => ({
        name: sanitizeAsaasText(item.name),
        quantity: item.quantity,
        value: item.unitPriceCents / 100,
        ...(item.description && { description: sanitizeAsaasText(item.description) }),
      })),
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
      items: [
        {
          name: sanitizeAsaasText(params.description),
          quantity: 1,
          value: params.amountCents / 100,
        },
      ],
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
  /** ACTIVE | INACTIVE | EXPIRED — só ACTIVE segue gerando cobrança. */
  status: string
  // Assinatura excluída no painel (ou pela própria Asaas após esgotar as
  // tentativas num cartão recusado). Mesmo comportamento de `payment.deleted`:
  // a Asaas NÃO devolve 404 para ela — o objeto vem normal com esta flag —,
  // então quem só trata 404 conclui erradamente que a assinatura segue viva.
  deleted?: boolean
  nextDueDate?: string | null
  value?: number
}

/** Reconsulta o status de uma assinatura na origem — defesa em profundidade antes de renovar via webhook. */
export async function getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`)
}

/**
 * "Essa assinatura ainda cobra na Asaas?" — resolve a pergunta em um
 * booleano, tratando o 404 como resposta legítima (assinatura inexistente)
 * em vez de erro. É a base da reconciliação: a Asaas é a fonte de verdade,
 * e um estado local divergente (linha `active` órfã travando a reassinatura)
 * só pode ser corrigido perguntando aqui.
 *
 * Devolve `null` quando a Asaas está inacessível/instável (rede, 5xx): nesse
 * caso NÃO se conclui nada — quem chama mantém o estado local como está, em
 * vez de cancelar acesso pago por causa de uma indisponibilidade passageira.
 */
export async function isSubscriptionLiveAtAsaas(subscriptionId: string): Promise<boolean | null> {
  try {
    const sub = await getSubscription(subscriptionId)
    if (sub.deleted) return false
    return sub.status === "ACTIVE"
  } catch (err) {
    // 404 = a assinatura não existe mais lá. É informação, não falha.
    if (err instanceof AsaasError && err.status === 404) return false
    console.error("[asaas] isSubscriptionLiveAtAsaas:", err)
    return null
  }
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
  // Cobrança removida no painel. A Asaas NÃO devolve 404 para ela — o objeto
  // vem normalmente com esta flag —, então é por aqui que confirmamos um
  // evento PAYMENT_DELETED em vez de confiar só no webhook.
  deleted?: boolean
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
 * autenticado via header `asaas-access-token`, mas reconsultamos aqui mesmo
 * assim antes de liberar o pedido — defesa em profundidade: um token de
 * webhook vazado não basta para forjar um pagamento se o handler sempre
 * confirma na origem.
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
