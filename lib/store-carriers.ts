/**
 * Transportadoras de envio da Loja. Lista fixa: o admin escolhe uma delas ao
 * marcar o pedido como "Enviado", e o cliente recebe o link de rastreio da
 * escolhida em Meus Pedidos e no e-mail de envio.
 *
 * `store_orders.carrier` guarda o RÓTULO (é o que e-mail, Discord e auditoria
 * já mostram). Pedidos antigos têm texto livre; `findStoreCarrier` casa por
 * nome normalizado e, sem casar, a tela mostra o texto sem link.
 */
export const STORE_CARRIERS = ["Correios", "J&T Express", "Cainiao", "Anjun"] as const

export type StoreCarrier = (typeof STORE_CARRIERS)[number]

/**
 * Correios e J&T não aceitam o código na URL (captcha / CPF na própria
 * página): o link abre a consulta e o cliente cola o código copiado.
 * A Anjun não tem página pública de rastreio no Brasil; o 17TRACK a cobre e
 * já abre com o código preenchido.
 */
const TRACKING_URL: Record<StoreCarrier, (code: string) => string> = {
  Correios: () => "https://rastreamento.correios.com.br/app/index.php",
  "J&T Express": () => "https://www.jtexpress.com.br/",
  Cainiao: (code) => `https://global.cainiao.com/newDetail.htm?mailNoList=${encodeURIComponent(code)}`,
  Anjun: (code) => `https://t.17track.net/pt#nums=${encodeURIComponent(code)}`,
}

/** Se o link já abre com o código, o cliente não precisa copiá-lo antes. */
const CODE_IN_URL: Record<StoreCarrier, boolean> = {
  Correios: false,
  "J&T Express": false,
  Cainiao: true,
  Anjun: true,
}

const ALIASES: Record<string, StoreCarrier> = {
  correios: "Correios",
  jt: "J&T Express",
  jtexpress: "J&T Express",
  jet: "J&T Express",
  jetexpress: "J&T Express",
  cainiao: "Cainiao",
  anjun: "Anjun",
  anjunexpress: "Anjun",
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export function findStoreCarrier(value: string | null | undefined): StoreCarrier | null {
  if (!value) return null
  return ALIASES[normalize(value)] ?? null
}

export function storeCarrierTracking(
  carrier: string | null | undefined,
  trackingCode: string | null | undefined
): { carrier: StoreCarrier; url: string; codeInUrl: boolean } | null {
  const found = findStoreCarrier(carrier)
  const code = trackingCode?.trim()
  if (!found || !code) return null
  return { carrier: found, url: TRACKING_URL[found](code), codeInUrl: CODE_IN_URL[found] }
}
