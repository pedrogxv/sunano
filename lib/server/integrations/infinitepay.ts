import "server-only"

import { isInternationalPhone, isValidPhone, normalizePhone } from "@/lib/br-format"
import { secretsMatch } from "@/lib/server/secret-compare"

/**
 * Cliente InfinitePay — SERVIDOR APENAS. Gateway de CARTÃO da Loja quando
 * `STORE_CARD_GATEWAY=infinitepay` (ver `lib/server/payments/gateway.ts`).
 *
 * Checkout integrado (link de pagamento hospedado): o pedido gera um link, o
 * cliente paga na página da InfinitePay e volta para `/checkout/card`. O
 * cartão nunca passa pelo nosso site.
 *
 * A API é pública: a conta se identifica pela InfiniteTag (`handle`), sem
 * chave secreta, e o webhook NÃO tem assinatura. Por isso nada é liberado
 * pelo que chega (corpo do webhook ou query string do retorno): toda
 * aprovação é conferida em `payment_check`, servidor a servidor, antes de
 * tocar no pedido. O token na URL do webhook só impede que terceiros usem a
 * nossa rota para disparar consultas em volume.
 *
 * Não há sandbox nem estorno por API: teste é em produção com valor baixo, e
 * estorno é feito no app da InfinitePay (o admin só registra).
 */

const API_BASE = "https://api.checkout.infinitepay.io"
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Parcelas em que a LOJA paga a taxa do parcelamento (`assured_installments`,
 * 0 a 12). A sobretaxa de cartão (10%) cobre a taxa até ~6x: acima disso a
 * InfinitePay repassa os juros ao cliente, e o `payment_check` devolve
 * `paid_amount` maior que `amount`.
 */
const ASSURED_INSTALLMENTS = 6

/** Configuração ausente. Tipada para o webhook responder erro NOSSO (reentrega), não "não autorizado". */
export class InfinitePayConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InfinitePayConfigError"
  }
}

export class InfinitePayError extends Error {
  readonly status: number
  readonly apiCode: string | null
  readonly apiMessage: string | null

  constructor(path: string, status: number, body: string) {
    let apiCode: string | null = null
    let apiMessage: string | null = null
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string }
      apiCode = typeof parsed.error === "string" ? parsed.error : null
      apiMessage = typeof parsed.message === "string" ? parsed.message : null
    } catch {
      // corpo não-JSON: fica só o status
    }
    super(`InfinitePay ${path} → ${status}${apiCode ? ` ${apiCode}` : ""}${apiMessage ? `: ${apiMessage}` : ""}`)
    this.name = "InfinitePayError"
    this.status = status
    this.apiCode = apiCode
    this.apiMessage = apiMessage
  }
}

/** InfiniteTag da conta, sem o `$` do começo. */
function getHandle(): string {
  const raw = process.env.INFINITEPAY_HANDLE?.trim().replace(/^\$/, "")
  if (!raw) throw new InfinitePayConfigError("INFINITEPAY_HANDLE ausente")
  if (!/^[a-z0-9_.-]{2,64}$/i.test(raw)) throw new InfinitePayConfigError("INFINITEPAY_HANDLE em formato inválido")
  return raw
}

function getWebhookToken(): string {
  const token = process.env.INFINITEPAY_WEBHOOK_TOKEN?.trim()
  if (!token || token.length < 24) {
    throw new InfinitePayConfigError("INFINITEPAY_WEBHOOK_TOKEN ausente ou curto (mínimo 24 caracteres)")
  }
  return token
}

/**
 * Rodando no `next dev` da máquina de quem desenvolve (fora da Vercel)? Os
 * dois sinais juntos: a Vercel sempre builda em `production` e define
 * `VERCEL=1`, então nenhum deploy (nem preview) cai aqui.
 */
function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL
}

/**
 * A InfinitePay não tem ambiente de teste: configurada, a cobrança é sempre
 * REAL. Lança se faltar config, e é isso que desliga o cartão em
 * `storeCardPaymentsEnabled` (em vez de oferecer um cartão que o checkout
 * não consegue cobrar).
 *
 * Exceção: no `next dev` local ela se declara sandbox. É o que deixa testar o
 * cartão em localhost com o PIX em sandbox (a trava de ambiente igual de
 * `storeCardPaymentsEnabled` desligaria o cartão), e o pedido nasce com
 * `is_sandbox = true` (que vem do PIX), fora da fila e da receita de
 * produção. O dinheiro, porém, é de verdade: teste com valor baixo e
 * estorne pelo app.
 */
export function isInfinitePaySandbox(): boolean {
  getHandle()
  getWebhookToken()
  return isLocalDevelopment()
}

/** URL do webhook com o token. Vai em cada link criado (a InfinitePay não tem cadastro no painel). */
export function infinitePayWebhookUrl(siteUrl: string): string {
  return `${siteUrl}/api/webhooks/infinitepay?token=${encodeURIComponent(getWebhookToken())}`
}

export function isValidInfinitePayWebhookToken(provided: string | null): boolean {
  return secretsMatch(provided, getWebhookToken())
}

/**
 * No `next dev`, o retorno e o webhook vão para `NEXT_PUBLIC_APP_URL`, que é
 * um túnel (ngrok). Com o túnel fora do ar, a cobrança é real mas os dois
 * avisos se perdem: o pedido fica `pending` para sempre e o cliente vê o link
 * de pagar de novo. Sem `transaction_nsu`, `payment_check` não acha a venda
 * (consultar só por `order_nsu` devolve `success: false`), então não há como
 * recuperar depois. Melhor recusar o link antes de cobrar.
 *
 * A rota do webhook só tem POST: o GET responde 405 quando o túnel chega no
 * Next. O ngrok offline responde 404 (ERR_NGROK_3200).
 */
async function assertLocalCallbackReachable(webhookUrl: string): Promise<void> {
  const probe = new URL(webhookUrl)
  probe.search = ""
  let status: number
  try {
    const res = await fetch(probe, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5_000) })
    status = res.status
  } catch (err) {
    throw new InfinitePayConfigError(`webhook local inalcançável (${probe.host}): ${String(err)}`)
  }
  if (status !== 405) {
    throw new InfinitePayConfigError(
      `webhook local não chega no Next (${probe.host} → ${status}). O túnel do NEXT_PUBLIC_APP_URL está no ar?`
    )
  }
}

/**
 * `transaction_nsu` e `slug` vêm do navegador (query do retorno) ou do corpo
 * do webhook: só seguem para a API se tiverem cara de id.
 */
export function isInfinitePayReference(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new InfinitePayError(path, res.status, text)
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * Telefone no formato da API (`+5511999887766`). O de fora do Brasil já é
 * gravado em E.164 (`normalizePhone`) e vai como está; fora dos dois padrões,
 * não vai.
 */
function toE164(phone: string | null | undefined): string | null {
  const raw = phone ?? ""
  if (isInternationalPhone(raw)) return isValidPhone(raw) ? normalizePhone(raw) : null
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`
  return null
}

export interface CreateInfinitePayLinkParams {
  /** Id do pedido: vai como `order_nsu` e volta no webhook e no retorno. */
  orderId: string
  /** Total que a InfinitePay deve cobrar (a soma dos itens é o valor cobrado). */
  totalCents: number
  items: { description: string; quantity: number; unitPriceCents: number }[]
  /** Usado como item único quando a soma dos itens não fecha com o total. */
  fallbackDescription: string
  redirectUrl: string
  webhookUrl: string
  customer: { name: string | null; email: string | null; phone: string | null }
  /**
   * A página da InfinitePay pede endereço mesmo com a coleta desligada no
   * painel. Mandar o que já temos faz o formulário vir preenchido, e o
   * cliente só confirma.
   */
  address: {
    postalCode: string
    street: string
    neighborhood: string
    number: string
    complement?: string | null
  } | null
}

/**
 * Cria o link do checkout. A InfinitePay cobra a SOMA dos itens, então ela
 * tem de fechar centavo a centavo com o total do pedido: o preço de cartão é
 * arredondado item a item e o total sobre o pedido, e os dois divergem em
 * centavos. Divergiu, vai um item único com o total.
 */
export async function createInfinitePayCheckoutLink(params: CreateInfinitePayLinkParams): Promise<{ url: string }> {
  if (isLocalDevelopment()) await assertLocalCallbackReachable(params.webhookUrl)

  const itemsSum = params.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
  const items =
    params.items.length > 0 && itemsSum === params.totalCents && params.items.every((item) => item.unitPriceCents > 0)
      ? params.items
      : [{ description: params.fallbackDescription, quantity: 1, unitPriceCents: params.totalCents }]

  const phone = toE164(params.customer.phone)
  const buildBody = (withPhone: boolean) => {
    const customer = {
      ...(params.customer.name ? { name: params.customer.name.slice(0, 100) } : {}),
      ...(params.customer.email ? { email: params.customer.email } : {}),
      ...(phone && withPhone ? { phone_number: phone } : {}),
    }
    return {
      handle: getHandle(),
      order_nsu: params.orderId,
      redirect_url: params.redirectUrl,
      webhook_url: params.webhookUrl,
      assured_installments: ASSURED_INSTALLMENTS,
      items: items.map((item) => ({
        quantity: item.quantity,
        price: item.unitPriceCents,
        description: item.description.slice(0, 100),
      })),
      ...(Object.keys(customer).length > 0 ? { customer } : {}),
      ...(params.address
        ? {
            address: {
              cep: params.address.postalCode.replace(/\D/g, ""),
              street: params.address.street,
              neighborhood: params.address.neighborhood,
              number: params.address.number,
              ...(params.address.complement ? { complement: params.address.complement } : {}),
            },
          }
        : {}),
    }
  }

  let data: { url?: string }
  try {
    data = await post<{ url?: string }>("/links", buildBody(true))
  } catch (err) {
    // A documentação só mostra número brasileiro. Se recusar o de fora, o link
    // sai sem telefone e o cliente digita na página da InfinitePay, em vez de
    // o pagamento travar por um campo que só pré-preenche.
    const rejectedForeignPhone =
      phone !== null &&
      !phone.startsWith("+55") &&
      err instanceof InfinitePayError &&
      err.status >= 400 &&
      err.status < 500
    if (!rejectedForeignPhone) throw err
    data = await post<{ url?: string }>("/links", buildBody(false))
  }

  // Só aceita link da própria InfinitePay: a URL vai para o navegador do
  // cliente como destino de redirecionamento. A página de checkout fica em
  // `checkout.infinitepay.com.br` (a API é `.io`), então os dois domínios valem.
  const url = data.url
  if (!url || !/^https:\/\/([a-z0-9-]+\.)*infinitepay\.(io|com\.br)\//i.test(url)) {
    throw new Error(`InfinitePay /links devolveu URL inesperada: ${String(url)}`)
  }
  return { url }
}

export type InfinitePayPaymentCheck = {
  paid: boolean
  /** Valor da venda (o que pedimos). */
  amountCents: number
  /** O que o comprador pagou: maior que `amountCents` quando os juros do parcelamento são repassados. */
  paidAmountCents: number
  installments: number | null
  captureMethod: "credit_card" | "pix" | string | null
}

/**
 * Consulta na origem se a transação pagou o pedido. É a ÚNICA fonte para
 * liberar um pedido da InfinitePay. `null` = a InfinitePay não reconhece a
 * combinação (pedido, transação, fatura).
 */
export async function checkInfinitePayPayment(params: {
  orderId: string
  transactionNsu: string
  slug: string
}): Promise<InfinitePayPaymentCheck | null> {
  if (!isInfinitePayReference(params.transactionNsu) || !isInfinitePayReference(params.slug)) return null

  let data: {
    success?: boolean
    paid?: boolean
    amount?: number
    paid_amount?: number
    installments?: number
    capture_method?: string
  }
  try {
    data = await post("/payment_check", {
      handle: getHandle(),
      order_nsu: params.orderId,
      transaction_nsu: params.transactionNsu,
      slug: params.slug,
    })
  } catch (err) {
    if (err instanceof InfinitePayError && err.status === 404) return null
    throw err
  }
  if (data.success !== true) return null

  const amountCents = Number(data.amount)
  const paidAmountCents = Number(data.paid_amount ?? data.amount)
  if (!Number.isInteger(amountCents) || !Number.isInteger(paidAmountCents)) {
    throw new Error(`InfinitePay payment_check devolveu valores inválidos: ${JSON.stringify(data)}`)
  }
  return {
    paid: data.paid === true,
    amountCents,
    paidAmountCents,
    installments: Number.isInteger(data.installments) ? (data.installments as number) : null,
    captureMethod: typeof data.capture_method === "string" ? data.capture_method : null,
  }
}
