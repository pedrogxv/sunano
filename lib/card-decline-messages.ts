/**
 * Mensagem para o CLIENTE quando o cartão é recusado, a partir do `code` /
 * `decline_code` que o Stripe devolve (a mensagem dele vem em inglês).
 *
 * Recusas por suspeita de fraude (`fraudulent`, `lost_card`, `stolen_card`,
 * `pickup_card`, `merchant_blacklist`…) saem como recusa GENÉRICA de
 * propósito: dizer "cartão roubado" a quem está testando cartões entrega
 * exatamente o sinal que ele procura. Recomendação do próprio Stripe.
 */

const GENERIC = "O cartão foi recusado pelo banco emissor. Tente outro cartão ou pague com PIX."

const BY_DECLINE_CODE: Record<string, string> = {
  insufficient_funds: "Saldo ou limite insuficiente. Tente outro cartão ou pague com PIX.",
  card_velocity_exceeded: "O cartão atingiu o limite de uso. Tente outro cartão ou pague com PIX.",
  withdrawal_count_limit_exceeded: "O cartão atingiu o limite de uso. Tente outro cartão ou pague com PIX.",
  expired_card: "O cartão está vencido. Confira a validade ou use outro cartão.",
  incorrect_cvc: "O código de segurança (CVV) não confere. Confira e tente de novo.",
  invalid_cvc: "O código de segurança (CVV) não confere. Confira e tente de novo.",
  incorrect_number: "O número do cartão não confere. Confira e tente de novo.",
  invalid_number: "O número do cartão não confere. Confira e tente de novo.",
  invalid_expiry_month: "A validade do cartão não confere. Confira e tente de novo.",
  invalid_expiry_year: "A validade do cartão não confere. Confira e tente de novo.",
  authentication_required: "O banco pediu autenticação e ela não foi concluída. Tente de novo.",
  processing_error: "O banco não conseguiu processar agora. Aguarde um instante e tente de novo.",
  issuer_not_available: "O banco emissor não respondeu. Aguarde um instante e tente de novo.",
  try_again_later: "O banco não conseguiu processar agora. Aguarde um instante e tente de novo.",
  card_not_supported: "Este cartão não aceita este tipo de compra. Tente outro cartão ou pague com PIX.",
  currency_not_supported: "Este cartão não aceita compras em reais. Tente outro cartão ou pague com PIX.",
}

const BY_CODE: Record<string, string> = {
  expired_card: BY_DECLINE_CODE.expired_card,
  incorrect_cvc: BY_DECLINE_CODE.incorrect_cvc,
  invalid_cvc: BY_DECLINE_CODE.invalid_cvc,
  incorrect_number: BY_DECLINE_CODE.incorrect_number,
  invalid_number: BY_DECLINE_CODE.invalid_number,
  invalid_expiry_month: BY_DECLINE_CODE.invalid_expiry_month,
  invalid_expiry_year: BY_DECLINE_CODE.invalid_expiry_year,
  processing_error: BY_DECLINE_CODE.processing_error,
  payment_intent_authentication_failure: "A autenticação do banco (3D Secure) não foi concluída. Tente de novo.",
}

export function cardDeclineMessage(code: string | null | undefined, declineCode: string | null | undefined): string {
  if (declineCode && BY_DECLINE_CODE[declineCode]) return BY_DECLINE_CODE[declineCode]
  if (code && BY_CODE[code]) return BY_CODE[code]
  return GENERIC
}

/**
 * Mesma régua para o Mercado Pago, a partir do `status_detail` da transação
 * recusada na Orders API (que consolida os `cc_rejected_*` da Payments API).
 * Recusa de risco (`high_risk`) e a genérica do emissor (`rejected_by_issuer`)
 * saem GENÉRICAS, pelo mesmo motivo de `fraudulent` no Stripe.
 */
const MERCADOPAGO_BY_STATUS_DETAIL: Record<string, string> = {
  insufficient_amount: BY_DECLINE_CODE.insufficient_funds,
  card_insufficient_amount: BY_DECLINE_CODE.insufficient_funds,
  bad_filled_card_data: "Algum dado do cartão não confere (número, validade ou CVV). Confira e tente de novo.",
  required_call_for_authorize: "O banco pediu que você autorize esta compra. Fale com o banco e tente de novo, ou pague com PIX.",
  card_disabled: "O cartão não está ativo. Fale com o banco ou use outro cartão.",
  max_attempts_exceeded: "O cartão atingiu o limite de tentativas. Use outro cartão ou pague com PIX.",
  invalid_installments: "Este cartão não aceita esse número de parcelas. Escolha outro.",
  processing_error: BY_DECLINE_CODE.processing_error,
  "3ds_challenge_expired": "A autenticação do banco não foi concluída a tempo. Tente de novo.",
  cc_rejected_3ds_challenge: "A autenticação do banco não foi concluída. Tente de novo.",
}

export function mercadoPagoDeclineMessage(statusDetail: string | null | undefined): string {
  return (statusDetail && MERCADOPAGO_BY_STATUS_DETAIL[statusDetail]) || GENERIC
}
