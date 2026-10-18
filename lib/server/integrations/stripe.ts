import "server-only"

import Stripe from "stripe"
import { orderNumber } from "@/lib/order-number"

/**
 * Cliente Stripe — SERVIDOR APENAS. Gateway ALTERNATIVO da Loja.
 *
 * A Asaas continua sendo o gateway padrão; o Stripe só entra quando
 * `STORE_PIX_GATEWAY`/`STORE_CARD_GATEWAY` (ou o legado `PAYMENT_GATEWAY`)
 * pedem `stripe` (ver `lib/server/payments/gateway.ts`). Existe para
 * a loja não ficar sem cobrar quando a conta da Asaas estiver indisponível.
 *
 * Mesmo desenho do fluxo da Asaas, para as telas não mudarem:
 *   • PIX → PaymentIntent confirmado no servidor; o QR e o copia-e-cola vão
 *     para as mesmas colunas (`pix_qr_code_base64`, `pix_copy_paste`) e a
 *     tela `/checkout/pix` faz o polling de sempre.
 *   • Cartão → formulário no NOSSO site (`/checkout/card`) com o Payment
 *     Element: os campos são iframes do Stripe, então nosso backend nunca
 *     recebe número, validade ou CVV (PCI SAQ A — nunca adicionar aqui uma
 *     função que receba dado cru de cartão). O navegador gera um
 *     ConfirmationToken e a NOSSA rota confirma; captura manual pelo webhook.
 *
 * Usa a chave em `STRIPE_SECRET_KEY`. Prefira uma restricted key (`rk_`) com
 * só as permissões usadas aqui: PaymentIntents (write), ConfirmationTokens
 * (read), Charges (read), Refunds (write, que já inclui a listagem usada em
 * `getStripePayment`), Disputes (read, usada por `getStripeDispute`; sem ela o
 * webhook de disputa responde 500 para sempre) e Radar Early Fraud Warnings
 * (read). Os eventos do Radar chegam pelo webhook e não exigem chamada à API.
 */

/**
 * Configuração de Stripe ausente ou incoerente (env faltando, chave de outro
 * modo, sandbox em produção). Tipada para o webhook responder 500 (erro NOSSO,
 * o Stripe reentrega) em vez de 400 "assinatura inválida", que esconderia a
 * causa e faria o Stripe desistir do evento.
 */
export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StripeConfigError"
  }
}

/**
 * Versão da API fixada. Mudar a versão muda o formato dos objetos que o
 * webhook lê; atualize junto com o SDK e confira os campos usados aqui.
 */
const STRIPE_API_VERSION = "2026-09-30.endive" as const

export type StripeEnvironment = "sandbox" | "production"

/**
 * Ambiente do Stripe. `STRIPE_ENV` é OBRIGATÓRIA e tem de bater com o prefixo
 * da chave — mesma régua de `ASAAS_ENV` (ver `resolveBaseUrl` em `asaas.ts`):
 * sem valor explícito, um deploy de produção podia cobrar com chave de teste e
 * liberar pedido real com pagamento de mentira.
 *
 *   • valor ausente/inválido            → erro;
 *   • chave `*_test_` com `production`   → erro (e vice-versa);
 *   • `sandbox` em deploy de produção    → erro.
 *
 * Roda no primeiro uso, não no import, para `next build` e as rotas que não
 * cobram não dependerem das envs de pagamento.
 */
export function resolveStripeEnvironment(): StripeEnvironment {
  const env = process.env.STRIPE_ENV?.trim().toLowerCase()
  if (env !== "production" && env !== "sandbox") {
    throw new StripeConfigError(
      `STRIPE_ENV precisa ser "production" ou "sandbox" (recebido: ${
        process.env.STRIPE_ENV ? `"${process.env.STRIPE_ENV}"` : "ausente"
      }).`
    )
  }

  const key = getSecretKey()
  const keyIsTest = /^(sk|rk)_test_/.test(key)
  const keyIsLive = /^(sk|rk)_live_/.test(key)
  if (!keyIsTest && !keyIsLive) {
    throw new StripeConfigError("STRIPE_SECRET_KEY não parece uma chave secreta/restrita do Stripe (sk_… ou rk_…).")
  }
  if (env === "sandbox" && !keyIsTest) {
    throw new StripeConfigError("STRIPE_ENV=sandbox com chave de produção (live). Use a chave de teste.")
  }
  if (env === "production" && !keyIsLive) {
    throw new StripeConfigError("STRIPE_ENV=production com chave de teste. Use a chave live.")
  }

  // A chave publicável monta o formulário do cartão. De outro modo que a
  // secreta, o cartão vira um token de teste contra uma cobrança real (ou
  // vice-versa) e toda compra no cartão falha — melhor falhar aqui, alto.
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  if (publishable) {
    const publishableIsTest = publishable.startsWith("pk_test_")
    if (publishableIsTest !== keyIsTest) {
      throw new StripeConfigError(
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY e STRIPE_SECRET_KEY são de modos diferentes (teste × produção)."
      )
    }
  }

  if (env === "sandbox" && process.env.VERCEL_ENV === "production") {
    throw new StripeConfigError(
      "STRIPE_ENV=sandbox em deploy de produção — pagamentos de teste liberariam pedidos reais. Configure STRIPE_ENV=production."
    )
  }

  return env
}

/** Marca de ambiente para `store_orders.is_sandbox`. Mesma validação acima. */
export function isStripeSandbox(): boolean {
  return resolveStripeEnvironment() === "sandbox"
}

function getSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new StripeConfigError("STRIPE_SECRET_KEY não configurada.")
  return key
}

let cachedClient: Stripe | null = null

function getStripe(): Stripe {
  // Valida ambiente × chave antes de qualquer chamada, não só no checkout:
  // estorno e cancelamento também movem dinheiro de verdade.
  resolveStripeEnvironment()
  if (!cachedClient) {
    cachedClient = new Stripe(getSecretKey(), {
      apiVersion: STRIPE_API_VERSION,
      appInfo: { name: "Sunano", url: "https://sunano.com.br" },
      maxNetworkRetries: 2,
      timeout: 15_000,
    })
  }
  return cachedClient
}

/**
 * O Stripe identifica as próprias exceções por classe. Guarda a mensagem
 * "humana" que ele devolve em 4xx (saldo insuficiente para estorno, cobrança
 * já estornada) para o admin ver o motivo real, igual ao `AsaasError`.
 */
export function stripeErrorMessage(err: unknown): string | null {
  if (err instanceof Stripe.errors.StripeError && err.statusCode && err.statusCode < 500) {
    return err.message
  }
  return null
}

// ---------------------------------------------------------------------------
// PIX
// ---------------------------------------------------------------------------

export interface CreateStripePixParams {
  /** Id do pedido, gerado antes do insert: vai no metadata e liga o webhook ao pedido. */
  orderId: string
  amountCents: number
  description: string
  payerName: string
  payerEmail: string | null
  /** CPF/CNPJ do pagador — só dígitos ou formatado, o Stripe normaliza. */
  payerDocument: string
  /** Prazo da LOJA para pagar (mesma janela de `pix_expires_at`). */
  expiresInSeconds: number
}

export interface StripePixPayment {
  paymentIntentId: string
  copyPaste: string
  /** Data URI pronto para `<img src>` — mesmo formato que a Asaas grava. */
  qrCodeDataUri: string | null
  /** ISO 8601. */
  expiresAt: string
}

/**
 * Cria e confirma no servidor um PaymentIntent PIX, devolvendo QR e
 * copia-e-cola para a tela de PIX que já existe.
 *
 * `allowed_payment_method_types: ["pix"]` é explícito: com métodos dinâmicos o Stripe
 * exige `return_url` na confirmação (algum método do painel pode redirecionar)
 * e recusa o PIX quando ele está desligado em Configurações → Métodos de
 * pagamento. Fixar o tipo dispensa os dois.
 *
 * O prazo do QR é o mesmo que a loja impõe (`expires_after_seconds`), então o
 * cron de expiração e o Stripe concordam sobre quando a cobrança morre — na
 * Asaas o QR vivia um ano e era preciso cortar do nosso lado.
 *
 * `idempotencyKey` amarrada ao pedido: um retry de rede do SDK não gera uma
 * segunda cobrança para o mesmo pedido.
 */
export async function createStripePixPayment(params: CreateStripePixParams): Promise<StripePixPayment> {
  const stripe = getStripe()
  // PIX aceita de 10 s a 14 dias.
  const expiresAfterSeconds = Math.min(Math.max(Math.round(params.expiresInSeconds), 10), 1_209_600)

  const intent = await stripe.paymentIntents.create(
    {
      amount: params.amountCents,
      currency: "brl",
      description: params.description,
      confirm: true,
      allowed_payment_method_types: ["pix"],
      payment_method_data: {
        type: "pix",
        billing_details: {
          name: params.payerName,
          ...(params.payerEmail ? { email: params.payerEmail } : {}),
          tax_id: params.payerDocument.replace(/\D/g, ""),
        },
      },
      payment_method_options: {
        pix: { expires_after_seconds: expiresAfterSeconds },
      },
      metadata: { order_id: params.orderId, order_number: orderNumber(params.orderId), source: "store" },
    },
    { idempotencyKey: `store-pix-${params.orderId}` }
  )

  const qr = intent.next_action?.pix_display_qr_code
  if (!qr?.data) {
    throw new Error(`Stripe PIX sem QR code (PaymentIntent ${intent.id}, status ${intent.status}).`)
  }

  const expiresAt = qr.expires_at
    ? new Date(qr.expires_at * 1000)
    : new Date(Date.now() + expiresAfterSeconds * 1000)

  return {
    paymentIntentId: intent.id,
    copyPaste: qr.data,
    qrCodeDataUri: qr.image_url_png ? await fetchAsDataUri(qr.image_url_png) : null,
    expiresAt: expiresAt.toISOString(),
  }
}

/**
 * O Stripe entrega o QR como URL de imagem, não como base64. Baixar e gravar
 * como data URI mantém a tela do PIX igual (ela lê `pix_qr_code_base64`) e não
 * exige liberar o domínio de imagens do Stripe na CSP.
 *
 * Falha aqui não derruba a compra: o copia-e-cola é o que paga, e a tela já
 * sabe esconder o QR quando ele vem nulo.
 */
async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = res.headers.get("content-type") ?? "image/png"
    if (!contentType.startsWith("image/")) throw new Error(`content-type ${contentType}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString("base64")}`
  } catch (err) {
    console.error("[stripe] falha ao baixar a imagem do QR PIX:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Cartão — formulário no NOSSO site (Payment Element), captura manual
// ---------------------------------------------------------------------------

export interface CreateStripeCardPaymentParams {
  orderId: string
  /** Texto da cobrança no painel do Stripe (número do pedido + itens). */
  description: string
  /** Total no preço de CARTÃO, em centavos. Fixado aqui; o navegador não muda. */
  amountCents: number
  customerEmail: string | null
}

/**
 * Cria o PaymentIntent do cartão, ainda SEM cartão: quem confirma é
 * `confirmStripeCardPayment`, chamado pela nossa rota com o ConfirmationToken
 * que o Payment Element gerou no navegador. O número do cartão vive só nos
 * iframes do Stripe (PCI SAQ A) — nunca adicionar aqui um parâmetro que receba
 * dado cru de cartão.
 *
 * `capture_method: "manual"`: a confirmação só AUTORIZA. O webhook
 * (`payment_intent.amount_capturable_updated`) decide capturar ou soltar a
 * autorização depois de conferir pedido, estoque e risco
 * (`decideCardCapture`). Soltar uma autorização não cobra o cliente nem gera
 * taxa de estorno — é o que torna seguro recusar um pagamento tardio ou suspeito.
 *
 * 3DS: `request_three_d_secure: "automatic"` — o Stripe pede quando o emissor
 * exige ou o Radar acha arriscado. Para exigir sempre num caso específico, use
 * uma regra do Radar ("Request 3D Secure if …"), não este parâmetro: a regra
 * se muda no painel sem deploy.
 *
 * Sem parcelamento: o Stripe Brasil não devolve planos de parcelas
 * (`available_plans` sai vazio mesmo com cartão BR), então o cartão é à vista.
 */
export async function createStripeCardPayment(params: CreateStripeCardPaymentParams): Promise<{
  paymentIntentId: string
}> {
  const intent = await getStripe().paymentIntents.create(
    {
      amount: params.amountCents,
      currency: "brl",
      description: params.description,
      allowed_payment_method_types: ["card"],
      capture_method: "manual",
      payment_method_options: { card: { request_three_d_secure: "automatic" } },
      statement_descriptor_suffix: statementSuffix(params.orderId),
      ...(params.customerEmail ? { receipt_email: params.customerEmail } : {}),
      metadata: { order_id: params.orderId, order_number: orderNumber(params.orderId), source: "store" },
    },
    { idempotencyKey: `store-card-pi-${params.orderId}` }
  )
  return { paymentIntentId: intent.id }
}

/**
 * Sufixo da fatura do cartão ("SUNANO* PED 1A2B3C"). Quem não reconhece a
 * linha na fatura abre disputa; o número do pedido ali é a forma mais barata
 * de evitar isso. Máx. 22 caracteres, sem `<>\\'"*`.
 */
function statementSuffix(orderId: string): string {
  return `PED ${orderNumber(orderId)}`.replace(/[<>\\'"*]/g, "").slice(0, 22)
}

export type StripeCardConfirmResult =
  | { outcome: "authorized" | "succeeded" | "processing" }
  /** 3DS ou outra ação no navegador: só aqui o `client_secret` sai do servidor. */
  | { outcome: "requires_action"; clientSecret: string }
  | { outcome: "declined"; code: string | null; declineCode: string | null }

/**
 * Confirma o PaymentIntent no SERVIDOR com o ConfirmationToken do navegador.
 *
 * Confirmar aqui (e não com `stripe.confirmPayment` no navegador) é o que deixa
 * a rota contar tentativas e recusar o excesso: com o `client_secret` no
 * navegador, um robô testaria milhares de cartões roubados direto na API do
 * Stripe, sem passar por nós — e a conta é que seria suspensa.
 *
 * Limite conhecido: quando o banco exige 3DS, o `client_secret` PRECISA ir ao
 * navegador (`stripe.handleNextAction` o exige). Daí em diante quem tem esse
 * segredo pode tentar confirmar o mesmo PaymentIntent com outro cartão sem
 * passar pela contagem da rota. O contrapeso é o Radar (regras de velocidade
 * por IP/cartão/e-mail, ver STRIPE_SETUP.md): ative antes de religar o cartão.
 */
export async function confirmStripeCardPayment(params: {
  paymentIntentId: string
  confirmationTokenId: string
  returnUrl: string
}): Promise<StripeCardConfirmResult> {
  try {
    const intent = await getStripe().paymentIntents.confirm(params.paymentIntentId, {
      confirmation_token: params.confirmationTokenId,
      return_url: params.returnUrl,
    })
    return intentToConfirmResult(intent)
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      return { outcome: "declined", code: err.code ?? null, declineCode: err.decline_code ?? null }
    }
    throw err
  }
}

function intentToConfirmResult(intent: Stripe.PaymentIntent): StripeCardConfirmResult {
  switch (intent.status) {
    case "requires_capture":
      return { outcome: "authorized" }
    case "succeeded":
      return { outcome: "succeeded" }
    case "processing":
      return { outcome: "processing" }
    case "requires_action":
      return { outcome: "requires_action", clientSecret: intent.client_secret ?? "" }
    default:
      return {
        outcome: "declined",
        code: intent.last_payment_error?.code ?? null,
        declineCode: intent.last_payment_error?.decline_code ?? null,
      }
  }
}

/** Estado do PaymentIntent para a tela de cartão (sem `client_secret`: ver a rota). */
export async function getStripeCardPaymentState(paymentIntentId: string): Promise<{
  status: Stripe.PaymentIntent.Status
  lastError: { code: string | null; declineCode: string | null } | null
}> {
  const intent = await getStripe().paymentIntents.retrieve(paymentIntentId)
  return {
    status: intent.status,
    lastError: intent.last_payment_error
      ? { code: intent.last_payment_error.code ?? null, declineCode: intent.last_payment_error.decline_code ?? null }
      : null,
  }
}

/**
 * Captura uma autorização (valor integral).
 *
 * SEM chave de idempotência de propósito: o Stripe guarda o resultado da
 * primeira chamada com a chave, ERRO inclusive, e o devolve por 24 horas. Uma
 * falha passageira (5xx, saldo, rede) ficaria repetida em toda reentrega do
 * webhook e a autorização venceria sem captura. Capturar duas vezes não cobra
 * duas vezes (a segunda recusa por estado), então a chave não protegia nada.
 *
 * "Já finalizado" (capturado pelo webhook enquanto o admin clicava, ou
 * cancelado) não é erro aqui: quem chama relê o PaymentIntent
 * (`markStripeOrdersPaid` só age em `succeeded`) e decide pelo status real.
 */
export async function captureStripePayment(paymentIntentId: string): Promise<void> {
  try {
    await getStripe().paymentIntents.capture(paymentIntentId)
  } catch (err) {
    if (!isStripeAlreadyFinalError(err)) throw err
  }
}

// ---------------------------------------------------------------------------
// Consulta, cancelamento e estorno
// ---------------------------------------------------------------------------

export interface StripePaymentSnapshot {
  paymentIntentId: string
  status: Stripe.PaymentIntent.Status
  /** Valor efetivamente recebido (capturado), em centavos. */
  amountReceivedCents: number
  /** Valor autorizado e ainda não capturado (cartão em captura manual). */
  amountCapturableCents: number
  currency: string
  /**
   * Estornado, em centavos: estornos `succeeded` + `pending` (dinheiro já
   * comprometido). Fica de fora o que falhou ou foi cancelado — um estorno de
   * PIX que falha devolve o valor ao saldo e o pedido volta a contar como pago.
   */
  refundedCents: number
  receiptUrl: string | null
  installmentCount: number | null
  orderId: string | null
  /** `pix` ou `card` — o PaymentIntent da loja sempre nasce com um tipo só. */
  methodType: "pix" | "card" | null
  /** Nível de risco do Radar na cobrança (`normal`, `elevated`, `highest`…). */
  riskLevel: string | null
  /** Resultado do 3DS (`authenticated`, `attempt_acknowledged`, `failed`…); null = não houve. */
  threeDSecureResult: string | null
  /** A cobrança caiu numa revisão aberta do Radar. */
  inRadarReview: boolean
}

/**
 * Lê o PaymentIntent na ORIGEM, com a cobrança expandida. Os webhooks sempre
 * passam por aqui antes de liberar, capturar ou devolver qualquer coisa —
 * mesma defesa em profundidade do `getPayment` da Asaas: um evento
 * reentregue, atrasado ou forjado não basta para mexer em pedido.
 */
export async function getStripePayment(paymentIntentId: string): Promise<StripePaymentSnapshot> {
  const stripe = getStripe()
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  })
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null

  let refundedCents = 0
  if (charge && charge.amount_refunded > 0) {
    const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 })
    refundedCents = refunds.data
      .filter((refund) => refund.status === "succeeded" || refund.status === "pending")
      .reduce((sum, refund) => sum + refund.amount, 0)
  }

  const allowed = intent.payment_method_types ?? []
  const methodType = allowed.includes("pix") ? "pix" : allowed.includes("card") ? "card" : null

  return {
    paymentIntentId: intent.id,
    status: intent.status,
    amountReceivedCents: intent.amount_received ?? 0,
    amountCapturableCents: intent.amount_capturable ?? 0,
    currency: intent.currency,
    refundedCents,
    receiptUrl: charge?.receipt_url ?? null,
    installmentCount: charge?.payment_method_details?.card?.installments?.plan?.count ?? null,
    orderId: intent.metadata?.order_id ?? null,
    methodType,
    riskLevel: charge?.outcome?.risk_level ?? null,
    threeDSecureResult: charge?.payment_method_details?.card?.three_d_secure?.result ?? null,
    inRadarReview: Boolean(charge?.review),
  }
}

/**
 * Cancela um PaymentIntent ainda não capturado: PIX não pago, ou cartão
 * AUTORIZADO (solta a autorização — o cliente não é cobrado). O Stripe recusa
 * (4xx) quando já foi pago ou cancelado; quem chama trata como "já resolvido",
 * igual ao `cancelPayment` da Asaas.
 */
export async function cancelStripePayment(paymentIntentId: string): Promise<void> {
  await getStripe().paymentIntents.cancel(paymentIntentId)
}

/**
 * Relê a disputa na ORIGEM. Os eventos de disputa chegam fora de ordem (um
 * `created` atrasado depois do `closed`), e gravar o status do corpo do
 * evento desfaria uma perda já registrada.
 */
export async function getStripeDispute(disputeId: string): Promise<Stripe.Dispute> {
  return getStripe().disputes.retrieve(disputeId)
}

/** O PaymentIntent já não aceita cancelamento (pago, cancelado) — erro esperado. */
export function isStripeAlreadyFinalError(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    (err.code === "payment_intent_unexpected_state" || /status of (succeeded|canceled)/i.test(err.message))
  )
}

/**
 * Estorna integral (sem `amountCents`) ou parcial. O Stripe aceita vários
 * estornos parciais até o total da cobrança.
 */
export async function refundStripePayment(
  paymentIntentId: string,
  params: {
    amountCents?: number
    reason?: string
    /** Motivo para o Stripe: `fraudulent` alimenta o Radar (aviso de fraude). */
    stripeReason?: "requested_by_customer" | "fraudulent" | "duplicate"
    /**
     * Amarra o estorno a um fato único (pedido + total estornado depois dele):
     * dois cliques simultâneos no admin passavam juntos pela checagem de saldo
     * do banco e geravam dois estornos parciais. Com a chave, o segundo devolve
     * o mesmo estorno.
     *
     * ATENÇÃO: o Stripe guarda também a FALHA da primeira chamada e a repete por
     * 24 horas com a mesma chave (ex.: saldo insuficiente, que o admin resolve e
     * tenta de novo). Por isso quem chama inclui na chave um contador de
     * tentativas (`refund_attempt` no metadata do pedido), incrementado a cada
     * falha: o clique duplo continua colapsando e a nova tentativa passa.
     */
    idempotencyKey?: string
  }
): Promise<{ refundId: string; status: string | null }> {
  const refund = await getStripe().refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(params.amountCents !== undefined ? { amount: params.amountCents } : {}),
      reason: params.stripeReason ?? "requested_by_customer",
      metadata: params.reason ? { reason: params.reason.slice(0, 500) } : {},
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  )
  return { refundId: refund.id, status: refund.status }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Eventos que o endpoint `/api/webhooks/stripe` precisa assinar no painel.
 * Tem de bater com os ramos da rota: evento tratado e não assinado é cenário
 * que nunca dispara (estorno feito no painel, disputa, aviso de fraude).
 */
export const STRIPE_WEBHOOK_EVENTS = [
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.refund.updated",
  "refund.updated",
  "refund.failed",
  "radar.early_fraud_warning.created",
  "review.opened",
  "review.closed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
] as const

/**
 * Valida a assinatura do webhook (`Stripe-Signature`) contra o corpo CRU. Lança
 * se a assinatura não bate ou se `STRIPE_WEBHOOK_SECRET` não está configurado.
 */
export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) throw new StripeConfigError("STRIPE_WEBHOOK_SECRET não configurado.")
  return getStripe().webhooks.constructEvent(rawBody, signature, secret)
}

export type { Stripe }
