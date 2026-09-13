import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

// `page.tsx` desta rota é "use client", e Client Component não pode exportar
// `metadata` — daí este layout. Página pública: metadata própria em vez de herdar o título da home.
export const metadata: Metadata = buildMetadata({
  title: "Promoções",
  description: "Promoções e ofertas de periféricos garimpadas pelo Sunano, atualizadas todo dia.",
  path: "/offers",
})

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
