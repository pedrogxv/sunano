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
}

export interface AsaasCustomer {
  id: string
}

/**
 * Busca um customer existente pelo CPF (evita duplicar cadastro no painel
 * Asaas quando o cache em `user_profiles.asaas_customer_id` não tem o dado
 * — ex.: guest checkout recorrente com o mesmo CPF) e cria um novo se não
 * encontrar.
 */
export async function findOrCreateCustomer(params: FindOrCreateCustomerParams): Promise<AsaasCustomer> {
  const existing = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(params.cpfCnpj)}`
  )
  if (existing.data.length > 0) {
    return existing.data[0]
  }

  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      cpfCnpj: params.cpfCnpj,
      email: params.email ?? undefined,
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

export interface AsaasPaymentRefund {
  status: string
  value: number
  dateCreated: string
  description: string | null
}

export interface AsaasPaymentStatus {
  id: string
  status: string
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
