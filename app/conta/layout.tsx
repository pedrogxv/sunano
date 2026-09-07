import type { Metadata } from "next"

import { buildMetadata } from "@/lib/seo"

/**
 * Vale para a área de conta inteira (dados, pedidos, notificações, suporte):
 * conteúdo por usuário, nada indexável. O robots.txt só impede o rastreio —
 * sem `noIndex` uma URL linkada de fora ainda entra no índice e aparece na
 * SERP como resultado vazio. As páginas são client components e não podem
 * exportar metadata sozinhas, por isso o layout.
 */
export const metadata: Metadata = buildMetadata({
  title: "Minha conta",
  description: "Área da sua conta na Sunano.",
  path: "/conta",
  noIndex: true,
})

export default function ContaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
