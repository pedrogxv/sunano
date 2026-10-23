/**
 * `/api/conquistas/resgataveis` compartilhado entre quem monta junto.
 *
 * A sidebar (contador do menu) e a vitrine de conquistas da Home pedem o
 * mesmo endpoint no mesmo instante da hidratação — eram duas requisições
 * idênticas disputando a rede do celular logo na carga. A promessa em voo é
 * reaproveitada e descartada assim que termina, então quem montar depois
 * (ex.: voltar à Home após resgatar) busca o estado novo.
 */

export type RedeemableEvents = { count?: number; claimedMedalIds?: string[] }

let inflight: Promise<RedeemableEvents | null> | null = null

export function fetchRedeemableEvents(): Promise<RedeemableEvents | null> {
  if (!inflight) {
    inflight = fetch("/api/conquistas/resgataveis")
      .then((res) => (res.ok ? (res.json() as Promise<RedeemableEvents>) : null))
      .catch(() => null)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}
