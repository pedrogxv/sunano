import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

// `page.tsx` desta rota é "use client", e Client Component não pode exportar
// `metadata` — daí este layout. Cobre /checkout e as telas de pagamento (card, pix) — fluxo de compra, fora do índice.
export const metadata: Metadata = buildMetadata({
  title: "Checkout",
  description: "Finalize sua compra na Loja Sunano.",
  path: "/checkout",
  noIndex: true,
})

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
