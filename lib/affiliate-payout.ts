/**
 * Constantes do fluxo de saque compartilhadas entre cliente e servidor.
 *
 * O valor mínimo é decidido no banco (`affiliate_min_payout_cents()`, usada
 * dentro de `request_affiliate_payout`) — este espelho existe só para a tela
 * poder MOSTRAR a regra antes do envio. Se um dia mudar, mude nos dois
 * lugares: o banco continua sendo quem recusa, aqui é quem avisa.
 */
export const MIN_PAYOUT_CENTS = 2000

/** Teto de saques simultâneos em análise, espelhando a mesma RPC. */
export const MAX_PENDING_PAYOUTS = 3
