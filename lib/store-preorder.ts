import { CalendarClock, Ban, PackageOpen, Rocket, Truck, type LucideIcon } from "lucide-react"

/**
 * Lote de pré-venda e Lançamento (migration 20261213000001). Módulo puro: a
 * página do produto, o card e a seção "Lançamentos e Pré-venda" da Home leem
 * o estado DAQUI, para "Novo lote em breve" ser a mesma coisa em toda tela.
 *
 * Quem decide se dá para reservar é o banco (`reserve_preorder` recusa lote
 * que não está `open` e lote cheio). Esta tela só evita oferecer o que o
 * banco recusaria.
 */

export type PreorderStatus = "open" | "sold_out" | "next_batch_soon" | "closed" | "shipping"

export const PREORDER_STATUSES: readonly PreorderStatus[] = ["open", "sold_out", "next_batch_soon", "closed", "shipping"]

export function isPreorderStatus(value: unknown): value is PreorderStatus {
  return typeof value === "string" && (PREORDER_STATUSES as readonly string[]).includes(value)
}

export const PREORDER_STATUS_LABEL: Record<PreorderStatus, string> = {
  open: "Pré-venda aberta",
  sold_out: "Esgotado",
  next_batch_soon: "Novo lote em breve",
  closed: "Encerrada",
  shipping: "Enviando",
}

/** Uma frase do que o status significa para quem está olhando. */
export const PREORDER_STATUS_HINT: Record<PreorderStatus, string> = {
  open: "Reserve agora e receba assim que o lote chegar.",
  sold_out: "As unidades deste lote acabaram.",
  next_batch_soon: "Um novo lote vai abrir. Peça para ser avisado.",
  closed: "Esta pré-venda terminou.",
  shipping: "O lote chegou e os pedidos estão sendo enviados.",
}

/**
 * Cor de cada status. Pré-venda aberta é âmbar, a cor que o selo "Pré-venda"
 * já usa na vitrine; os outros saem dela de propósito, para o card de um lote
 * fechado não parecer convite.
 */
export const PREORDER_STATUS_STYLE: Record<PreorderStatus, { icon: LucideIcon; chip: string; text: string; bar: string }> = {
  open: { icon: Rocket, chip: "border-amber-400/30 bg-amber-400/15 text-amber-300", text: "text-amber-300", bar: "bg-amber-400" },
  sold_out: { icon: Ban, chip: "border-red-500/30 bg-red-500/15 text-red-400", text: "text-red-400", bar: "bg-red-500" },
  next_batch_soon: {
    icon: CalendarClock,
    chip: "border-sky-400/30 bg-sky-400/15 text-sky-300",
    text: "text-sky-300",
    bar: "bg-sky-400",
  },
  closed: { icon: PackageOpen, chip: "border-border bg-muted/40 text-muted-foreground", text: "text-muted-foreground", bar: "bg-muted-foreground" },
  shipping: { icon: Truck, chip: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300", text: "text-emerald-300", bar: "bg-emerald-400" },
}

/** O texto do botão principal de uma pré-venda aberta. */
export const PREORDER_CTA_LABEL = "Reservar na pré-venda"

export type PreorderInfo = {
  /** Como o admin deixou. `sold_out` também é DERIVADO quando o lote enche (ver `effectivePreorderStatus`). */
  status: PreorderStatus
  batchName: string | null
  /** Previsão de envio, `YYYY-MM-DD`. */
  shipsAt: string | null
  /** Tamanho do lote; `null` = sem teto. */
  limit: number | null
  /** Unidades já reservadas NESTE lote (pedidos válidos + reservas em voo). */
  reserved: number
}

/** Quantas sobram no lote; `null` quando o lote não tem teto (não há o que contar). */
export function preorderRemaining(info: Pick<PreorderInfo, "limit" | "reserved">): number | null {
  if (info.limit == null) return null
  return Math.max(info.limit - info.reserved, 0)
}

/** O status que a tela mostra: lote aberto mas cheio (ou produto esgotado à mão) é "Esgotado". */
export function effectivePreorderStatus(info: PreorderInfo, productSoldOut: boolean): PreorderStatus {
  if (info.status !== "open") return info.status
  if (productSoldOut || preorderRemaining(info) === 0) return "sold_out"
  return "open"
}

/** "20 de nov. de 2026". A data é civil (sem hora), então é formatada em UTC para não andar um dia. */
export function formatPreorderShipDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  )
}

/**
 * Lançamento marcado no admin e ainda dentro do prazo. `launchUntil` é o
 * último dia em que aparece, comparado com a data de hoje em Brasília (a
 * mesma régua de `todayKeySaoPaulo`, em lib/store-shipping.ts).
 */
export function isLaunchActive(product: { is_launch?: boolean | null; launch_until?: string | null }, todayKey: string): boolean {
  if (!product.is_launch) return false
  return product.launch_until == null || product.launch_until >= todayKey
}
