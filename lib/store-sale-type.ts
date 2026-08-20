import { Package, Rocket } from "lucide-react"

export type SaleType = "pre_order" | "ready_stock" | "normal"

export const SALE_TYPE_LABEL: Record<SaleType, string> = {
  pre_order: "Pré-venda",
  ready_stock: "Pronta entrega",
  normal: "",
}

export const SALE_TYPE_ICON = {
  pre_order: Rocket,
  ready_stock: Package,
} as const

/** Classe de cor compartilhada pelo badge, texto e ícone de cada tipo de venda. */
export const SALE_TYPE_TINT: Record<Exclude<SaleType, "normal">, string> = {
  pre_order: "amber",
  ready_stock: "emerald",
}
