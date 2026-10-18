import "server-only"

import { createHmac } from "node:crypto"
import { secretsMatch } from "@/lib/server/secret-compare"

/**
 * Cliente Mercado Pago — SERVIDOR APENAS. Gateway de CARTÃO da Loja quando
 * `STORE_CARD_GATEWAY=mercadopago` (ver `lib/server/payments/gateway.ts`).
 *
 * Checkout Transparente pela **Orders API** (`/v1/orders`), com o Card Payment
 * Brick: os campos do cartão são iframes do Mercado Pago em `/checkout/card`,
 * e o navegador manda para a NOSSA rota só o token de uso único que o Brick
 * gerou (PCI SAQ A — nunca adicionar aqui uma função que receba número,
 * validade ou CVV). É a nossa rota que cria a order, e é por isso que dá para
 * contar tentativas e barrar robô testando cartão roubado.
 *
 * Orders, não Payments: a Payments API (`/v1/payments`) não recebe mais
 * funcionalidade nova, e é a Orders que o Mercado Pago indica para
 * integração nova. Uma order da loja tem UMA transação de pagamento.
 *
 * REST direto, sem SDK: são quatro chamadas, e o SDK puxaria dependência para
 * o bundle do servidor sem tirar nenhuma validação daqui.
 */

const API_BASE = "https://api.mercadopago.com"
const REQUEST_TIMEOUT_MS = 15_000

/**
 * O ÚNICO e-mail de pagador que a Orders API aceita em sandbox (qualquer outro
 * volta 400 `invalid_email_for_sandbox`). Em produção vai o e-mail do pedido.
 */
const SANDBOX_PAYER_EMAIL = "test@testuser.com"

/**
 * Configuração do Mercado Pago ausente ou incoerente. Tipada para o webhook
 * responder 500 (erro NOSSO, o Mercado Pago reentrega) em vez de 401, que
 * esconderia a causa.
 */
export class MercadoPagoConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MercadoPagoConfigError"
  }
}

/** Resposta de erro da API. `apiMessage` é a primeira que o Mercado Pago devolveu. */
export class MercadoPagoError extends Error {
  readonly status: number
  readonly apiMessage: string | null
  readonly apiCode: string | null
  /** Orders API: `errors[0].details` (na recusa, `"PAY…: <status_detail>"`). */
  readonly apiDetails: string[]

  constructor(path: string, status: number, body: string) {
    let apiMessage: string | null = null
    let apiCode: string | null = null
    let apiDetails: string[] = []
    try {
      // Orders API: `errors: [{ code, message, details }]`. As outras: `message`/`cause`.
      const parsed = JSON.parse(body) as {
        message?: string
        errors?: Array<{ code?: string; message?: string; details?: unknown }>
        cause?: Array<{ description?: string }>
      }
      apiCode = parsed.errors?.[0]?.code ?? null
      apiMessage = parsed.errors?.[0]?.message ?? parsed.cause?.[0]?.description ?? parsed.message ?? null
      const details = parsed.errors?.[0]?.details
      if (Array.isArray(details)) apiDetails = details.filter((d): d is string => typeof d === "string")
    } catch {
      // corpo não-JSON: fica só o status
    }
    super(`Mercado Pago ${path} → ${status}${apiCode ? ` ${apiCode}` : ""}${apiMessage ? `: ${apiMessage}` : ""}`)
    this.name = "MercadoPagoError"
    this.status = status
    this.apiMessage = apiMessage
    this.apiCode = apiCode
    this.apiDetails = apiDetails
  }
}

export type MercadoPagoEnvironment = "sandbox" | "production"

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  if (!token) throw new MercadoPagoConfigError("MERCADOPAGO_ACCESS_TOKEN não configurada.")
  return token
}

/**
 * Ambiente do Mercado Pago. `MERCADOPAGO_ENV` é OBRIGATÓRIA — mesma régua de
 * `ASAAS_ENV` e `STRIPE_ENV`: sem valor explícito, um deploy de produção
 * podia cobrar com credencial de teste e liberar pedido real.
 *
 *   • valor ausente/inválido                         → erro;
 *   • credencial `TEST-`                             → erro (a Orders API recusa);
 *   • public key ou access token fora de `APP_USR-`  → erro;
 *   • `sandbox` em deploy de produção                → erro.
 *
 * Na Orders API, sandbox e produção usam a MESMA família de credencial
 * (`APP_USR-`): o teste é feito com as credenciais de produção de um USUÁRIO
 * DE TESTE vendedor. O prefixo não diz mais o ambiente — quem confere que a
 * conta casa com `MERCADOPAGO_ENV` é `assertAccountMatchesEnvironment`.
 *
 * Roda no primeiro uso, não no import: `next build` e as rotas que não cobram
 * não dependem das envs de pagamento.
 */
export function resolveMercadoPagoEnvironment(): MercadoPagoEnvironment {
  const env = process.env.MERCADOPAGO_ENV?.trim().toLowerCase()
  if (env !== "production" && env !== "sandbox") {
    throw new MercadoPagoConfigError(
      `MERCADOPAGO_ENV precisa ser "production" ou "sandbox" (recebido: ${
        process.env.MERCADOPAGO_ENV ? `"${process.env.MERCADOPAGO_ENV}"` : "ausente"
      }).`
    )
  }

  const token = getAccessToken()
  if (token.startsWith("TEST-")) {
    throw new MercadoPagoConfigError(
      "MERCADOPAGO_ACCESS_TOKEN é de teste (TEST-), e a Orders API não aceita credencial de teste. Em sandbox, use as credenciais de PRODUÇÃO de um usuário de teste vendedor."
    )
  }
  if (!token.startsWith("APP_USR-")) {
    throw new MercadoPagoConfigError("MERCADOPAGO_ACCESS_TOKEN não parece um access token do Mercado Pago (APP_USR-…).")
  }

  // A public key monta o Brick. De outra conta, o token de cartão gerado no
  // navegador não vale para a conta que cobra e TODA compra falha.
  const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim()
  if (!publicKey) {
    throw new MercadoPagoConfigError("NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY não configurada (monta o formulário do cartão).")
  }
  if (!publicKey.startsWith("APP_USR-")) {
    throw new MercadoPagoConfigError(
      "NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY precisa ser a public key de produção (APP_USR-…) da mesma aplicação do access token."
    )
  }

  if (env === "sandbox" && process.env.VERCEL_ENV === "production") {
    throw new MercadoPagoConfigError(
      "MERCADOPAGO_ENV=sandbox em deploy de produção — pagamentos de teste liberariam pedidos reais. Configure MERCADOPAGO_ENV=production."
    )
  }

  return env
}

/** Marca de ambiente para `store_orders.is_sandbox`. Mesma validação acima. */
export function isMercadoPagoSandbox(): boolean {
  return resolveMercadoPagoEnvironment() === "sandbox"
}

async function request<T>(
  path: string,
  init: {
    method: "GET" | "POST"
    body?: unknown
    idempotencyKey?: string
    deviceId?: string | null
  }
): Promise<T> {
  // Valida ambiente × credencial antes de QUALQUER chamada, não só no
  // checkout: estorno também mexe em dinheiro de verdade.
  resolveMercadoPagoEnvironment()

  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
      ...(init.deviceId ? { "X-meli-session-id": init.deviceId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const text = await res.text()
  if (!res.ok) throw new MercadoPagoError(path, res.status, text)
  return (text ? JSON.parse(text) : {}) as T
}

// ---------------------------------------------------------------------------
// Conta × ambiente
// ---------------------------------------------------------------------------

let accountCheck: { token: string; result: Promise<void> } | null = null

/**
 * A conta da credencial é de TESTE em sandbox e REAL em produção? Com o
 * prefixo igual nos dois ambientes, é a única barreira entre "credencial
 * trocada" e dinheiro de verdade: credencial real com `MERCADOPAGO_ENV=sandbox`
 * cobraria cartões reais em pedidos marcados como teste (fora da receita e da
 * fila), e a de um usuário de teste em produção liberaria pedidos sem dinheiro.
 * Lida uma vez por credencial e por instância.
 */
export async function assertAccountMatchesEnvironment(): Promise<void> {
  const env = resolveMercadoPagoEnvironment()
  const token = getAccessToken()
  if (accountCheck?.token !== token) {
    const result = (async () => {
      const me = await request<{ tags?: string[] }>("/users/me", { method: "GET" })
      const isTestAccount = (me.tags ?? []).includes("test_user")
      if (env === "sandbox" && !isTestAccount) {
        throw new MercadoPagoConfigError(
          "MERCADOPAGO_ENV=sandbox com a credencial de uma conta REAL — cobraria cartões de verdade. Use a credencial de produção de um usuário de teste vendedor."
        )
      }
      if (env === "production" && isTestAccount) {
        throw new MercadoPagoConfigError(
          "MERCADOPAGO_ENV=production com a credencial de um USUÁRIO DE TESTE — liberaria pedidos sem dinheiro. Use a credencial de produção da conta real."
        )
      }
    })()
    accountCheck = { token, result }
    // Falha de rede não fica em cache: a próxima chamada tenta de novo.
    result.catch((err) => {
      if (!(err instanceof MercadoPagoConfigError) && accountCheck?.result === result) accountCheck = null
    })
  }
  return accountCheck!.result
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

type RawOrderPayment = {
  id: string
  status: string
  status_detail?: string | null
  amount?: string | null
  paid_amount?: string | null
  payment_method?: { id?: string; type?: string; installments?: number | null } | null
}

type RawOrder = {
  id: string
  status: string
  status_detail?: string | null
  total_amount?: string | null
  currency_id?: string | null
  external_reference?: string | null
  transactions?: {
    payments?: RawOrderPayment[] | null
    refunds?: Array<{ id?: string; amount?: string | null; status?: string | null }> | null
  } | null
}

/**
 * O que o resto do código lê de uma order. Valores em CENTAVOS: a API fala em
 * reais (string com decimais), e misturar as duas unidades é como um pedido
 * de R$ 100 seria comparado com uma cobrança de 100 centavos.
 */
export interface MercadoPagoOrderSnapshot {
  /** `ORD…` — é o que fica em `store_orders.mercadopago_payment_id`. */
  id: string
  /** created | processing | action_required | processed | failed | canceled | refunded | charged_back | expired */
  status: string
  statusDetail: string | null
  /** A transação de pagamento (a loja cria uma por order). */
  paymentId: string | null
  paymentStatusDetail: string | null
  /** Valor da COMPRA, sem os juros de parcelamento que o comprador paga ao emissor. */
  amountCents: number
  refundedCents: number
  /** Nulo quando a resposta não traz a moeda (a conta é BRL). */
  currency: string | null
  installments: number | null
  externalReference: string | null
}

function toCents(value: string | number | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function toAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

function snapshotOf(raw: RawOrder): MercadoPagoOrderSnapshot {
  const payment = raw.transactions?.payments?.[0] ?? null
  const refundedCents = (raw.transactions?.refunds ?? [])
    .filter((refund) => refund.status !== "failed" && refund.status !== "rejected")
    .reduce((sum, refund) => sum + toCents(refund.amount), 0)
  return {
    id: raw.id,
    status: raw.status,
    statusDetail: raw.status_detail ?? null,
    paymentId: payment?.id ?? null,
    paymentStatusDetail: payment?.status_detail ?? null,
    amountCents: toCents(raw.total_amount ?? payment?.amount),
    refundedCents,
    currency: raw.currency_id ?? null,
    installments: payment?.payment_method?.installments ?? null,
    externalReference: raw.external_reference ?? null,
  }
}

/** Formato do id de order (`ORD` + ULID). Valida antes de pôr na URL. */
export function isMercadoPagoOrderId(value: string): boolean {
  return /^ORD[0-9A-Z]{20,40}$/i.test(value)
}

export interface CreateMercadoPagoCardOrderParams {
  orderId: string
  amountCents: number
  /** Token de uso único gerado pelo Brick no navegador. */
  token: string
  installments: number
  paymentMethodId: string
  payer: {
    email: string
    firstName: string | null
    lastName: string | null
    identification: { type: string; number: string } | null
  }
  description: string
  items: { id: string; title: string; quantity: number; unitPriceCents: number }[]
  /** Uma chave por TENTATIVA: o Mercado Pago devolve a mesma order para a mesma chave. */
  idempotencyKey: string
  /** Device ID do navegador (security.js). Ausente = order sem o sinal, não recusada. */
  deviceId: string | null
}

/**
 * Cria a order com o token do Brick, processada e capturada na hora. O valor
 * vem do PEDIDO (gravado no checkout), nunca do navegador: o Brick manda um
 * valor, e confiar nele deixaria pagar R$ 1 por um pedido de R$ 1.000.
 *
 * Cartão recusado volta como `{ declined }`, não como exceção.
 */
export async function createMercadoPagoCardOrder(
  params: CreateMercadoPagoCardOrderParams
): Promise<MercadoPagoOrderSnapshot | { declined: true; statusDetail: string | null }> {
  try {
    return await postCardOrder(params)
  } catch (err) {
    // Recusa do cartão = HTTP 402 `failed`, SEM a order no corpo (conferido no
    // sandbox): só `details: ["PAY…: insufficient_amount"]`. O motivo sai dali.
    if (err instanceof MercadoPagoError && err.status === 402 && err.apiCode === "failed") {
      const detail = err.apiDetails[0]?.split(":").slice(1).join(":").trim()
      return { declined: true, statusDetail: detail || null }
    }
    throw err
  }
}

async function postCardOrder(params: CreateMercadoPagoCardOrderParams): Promise<MercadoPagoOrderSnapshot> {
  await assertAccountMatchesEnvironment()
  const amount = toAmount(params.amountCents)
  const sandbox = resolveMercadoPagoEnvironment() === "sandbox"

  const raw = await request<RawOrder>("/v1/orders", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    deviceId: params.deviceId,
    body: {
      type: "online",
      processing_mode: "automatic",
      capture_mode: "automatic",
      total_amount: amount,
      external_reference: params.orderId,
      description: params.description.slice(0, 150),
      payer: {
        email: sandbox ? SANDBOX_PAYER_EMAIL : params.payer.email,
        ...(params.payer.firstName ? { first_name: params.payer.firstName } : {}),
        ...(params.payer.lastName ? { last_name: params.payer.lastName } : {}),
        ...(params.payer.identification ? { identification: params.payer.identification } : {}),
      },
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: params.paymentMethodId,
              type: "credit_card",
              token: params.token,
              installments: params.installments,
              statement_descriptor: "SUNANO",
            },
          },
        ],
      },
      // Dados do pedido melhoram a aprovação no antifraude do Mercado Pago.
      items: itemsMatchingTotal(params.items, params.amountCents, params.description).map((item) => ({
        // Máx. 30 caracteres (a API recusa o UUID de 36). Sem os hífens e
        // cortado: é dado de antifraude, não chave — não precisa ser único.
        external_code: item.id.replace(/-/g, "").slice(0, 30),
        title: item.title.slice(0, 150),
        quantity: item.quantity,
        unit_price: toAmount(item.unitPriceCents),
      })),
    },
  })
  return snapshotOf(raw)
}

/**
 * A Orders API recusa a order (`order_items_total_amount_mismatch`) se a soma
 * dos itens não for EXATAMENTE o total. O preço de cartão é arredondado item a
 * item e o total sobre o pedido, então divergem em centavos; frete ou cupom
 * divergem mais. Arredondamento (até 1 centavo por item) vai para um item de
 * quantidade 1; qualquer outra diferença vira uma linha única com o total —
 * os itens são dado de antifraude, quem manda no valor é `total_amount`.
 */
function itemsMatchingTotal(
  items: CreateMercadoPagoCardOrderParams["items"],
  amountCents: number,
  description: string
): CreateMercadoPagoCardOrderParams["items"] {
  const single = [{ id: "pedido", title: description, quantity: 1, unitPriceCents: amountCents }]
  if (items.length === 0) return single
  const diff = amountCents - items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
  if (diff === 0) return items
  const target = items.findIndex((item) => item.quantity === 1 && item.unitPriceCents + diff > 0)
  if (Math.abs(diff) > items.length || target === -1) return single
  return items.map((item, i) => (i === target ? { ...item, unitPriceCents: item.unitPriceCents + diff } : item))
}

export async function getMercadoPagoOrder(orderId: string): Promise<MercadoPagoOrderSnapshot> {
  if (!isMercadoPagoOrderId(orderId)) throw new Error(`id de order do Mercado Pago inválido: ${orderId}`)
  await assertAccountMatchesEnvironment()
  return snapshotOf(await request<RawOrder>(`/v1/orders/${orderId}`, { method: "GET" }))
}

/**
 * Estorno total (sem `amountCents`) ou parcial. O parcial precisa da
 * transação; ela é lida da própria order. A chave de idempotência colapsa
 * clique duplo no admin num estorno só.
 */
export async function refundMercadoPagoOrder(
  orderId: string,
  params: { amountCents?: number; idempotencyKey: string }
): Promise<void> {
  if (!isMercadoPagoOrderId(orderId)) throw new Error(`id de order do Mercado Pago inválido: ${orderId}`)
  let body: unknown = {}
  if (params.amountCents !== undefined) {
    const order = await getMercadoPagoOrder(orderId)
    if (!order.paymentId) throw new Error(`order ${orderId} sem transação de pagamento para estornar`)
    body = { transactions: [{ id: order.paymentId, amount: toAmount(params.amountCents) }] }
  }
  await request(`/v1/orders/${orderId}/refund`, { method: "POST", idempotencyKey: params.idempotencyKey, body })
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Assinatura do webhook (`x-signature: ts=…,v1=…`). O manifesto é o do
 * Mercado Pago: `id:<data.id da URL>;request-id:<x-request-id>;ts:<ts>;`,
 * HMAC-SHA256 com a "assinatura secreta" do painel. O `data.id` é o da QUERY
 * STRING (minúsculo quando alfanumérico, que é o caso do `ORD…`), não o do
 * corpo.
 *
 * A assinatura só prova que a notificação veio do Mercado Pago. Quem decide
 * o pedido continua sendo a consulta da order na origem.
 */
export function verifyMercadoPagoWebhookSignature(params: {
  signatureHeader: string | null
  requestId: string | null
  dataId: string | null
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()
  if (!secret) throw new MercadoPagoConfigError("MERCADOPAGO_WEBHOOK_SECRET não configurada.")
  if (!params.signatureHeader || !params.dataId) return false

  let ts: string | null = null
  let v1: string | null = null
  for (const part of params.signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s?.trim())
    if (key === "ts") ts = value ?? null
    if (key === "v1") v1 = value ?? null
  }
  if (!ts || !v1) return false

  const dataId = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId
  const manifest =
    `id:${dataId};` + (params.requestId ? `request-id:${params.requestId};` : "") + `ts:${ts};`
  const expected = createHmac("sha256", secret).update(manifest).digest("hex")
  return secretsMatch(v1.toLowerCase(), expected)
}
