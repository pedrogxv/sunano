/**
 * Estado do pagamento com cartão que `/api/store/orders/[id]/card-payment`
 * devolve para a tela `/checkout/card`. Compartilhado entre rota e tela.
 */
export type CardPaymentState =
  /** Formulário: ainda sem cartão, ou o último foi recusado. */
  | "ready"
  /** 3DS (ou outra ação do banco) pendente — só na resposta do POST, com o `clientSecret`. */
  | "requires_action"
  /** Autorizado/capturado/processando — a tela aguarda o pedido virar pago. */
  | "processing"
  /** Segurado para revisão manual: nada foi cobrado ainda. */
  | "review"
  /** Pedido não está mais pagável (pago, expirado, cancelado). A tela usa o status do pedido. */
  | "closed"
