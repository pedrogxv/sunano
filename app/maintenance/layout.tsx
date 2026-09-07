import type { Metadata } from "next"

import { buildMetadata } from "@/lib/seo"

/**
 * Tela de manutenção: estado temporário, nunca um resultado de busca válido.
 * Sem `noIndex` o Google podia capturá-la durante uma janela de manutenção e
 * mantê-la no índice no lugar da página real.
 */
export const metadata: Metadata = buildMetadata({
  title: "Em manutenção",
  description: "A Sunano está em manutenção no momento.",
  path: "/maintenance",
  noIndex: true,
})

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
