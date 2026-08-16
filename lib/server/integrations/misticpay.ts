import "server-only"

/**
 * Cliente MisticPay — SERVIDOR APENAS.
 *
 * Usa `MISTICPAY_CLIENT_SECRET`, que jamais pode chegar ao navegador. API
 * de PIX (sem checkout hospedado): cada compra gera uma transação com QR
 * code + copia-e-cola, confirmada depois via webhook ou polling em
 * `checkTransaction`. Docs: https://docs.misticpay.com/
 */
const BASE_URL = "https://api.misticpay.com/api"

function getCredentials() {
  const ci = process.env.MISTICPAY_CLIENT_ID
  const cs = process.env.MISTICPAY_CLIENT_SECRET
  if (!ci || !cs) throw new Error("MISTICPAY_CLIENT_ID/MISTICPAY_CLIENT_SECRET não configurados.")
  return { ci, cs }
}

async function misticpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { ci, cs } = getCredentials()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ci,
      cs,
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`MisticPay ${path} falhou (${res.status}): ${text}`)
  }

  return res.json() as Promise<T>
}

export interface CreatePixTransactionParams {
  amountCents: number
  transactionId: string
  description?: string
  // Obrigatórios pela API da MisticPay — sem eles ela rejeita com 400
  // "Todos os campos são obrigatórios".
  payerName: string
  payerDocument: string
}

export interface CreatePixTransactionResult {
  transactionId: string
  transactionState: "PENDENTE" | "COMPLETO" | "FALHA"
  qrCodeBase64: string
  qrcodeUrl: string
  copyPaste: string
}

export async function createPixTransaction(
  params: CreatePixTransactionParams
): Promise<CreatePixTransactionResult> {
  const response = await misticpayFetch<{
    data: {
      transactionId: string
      transactionState: "PENDENTE" | "COMPLETO" | "FALHA"
      qrCodeBase64: string
      qrcodeUrl: string
      copyPaste: string
    }
  }>("/transactions/create", {
    method: "POST",
    body: JSON.stringify({
      // amount na MisticPay é em reais (não centavos), com casas decimais.
      amount: params.amountCents / 100,
      transactionId: params.transactionId,
      description: params.description,
      payerName: params.payerName,
      payerDocument: params.payerDocument,
    }),
  })

  return response.data
}

export interface CheckTransactionResult {
  transactionId: string
  status: "PENDENTE" | "COMPLETO" | "FALHA"
  value: number
  e2e?: string
}

/**
 * Consulta o status real de uma transação direto na MisticPay. A API não
 * assina os webhooks recebidos (sem HMAC/verificação de origem — ver docs),
 * então o handler do webhook chama esta função antes de confiar em
 * qualquer payload e liberar o pedido, evitando que um POST forjado
 * confirme pagamento sem ele ter de fato ocorrido.
 */
export async function checkTransaction(transactionId: string): Promise<CheckTransactionResult> {
  return misticpayFetch<CheckTransactionResult>("/transactions/check", {
    method: "POST",
    body: JSON.stringify({ transactionId }),
  })
}
