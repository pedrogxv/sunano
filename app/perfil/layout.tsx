import type { Metadata } from "next"

import { buildMetadata } from "@/lib/seo"

/**
 * `noIndex` para `/perfil` — a rota sem handle, que só redireciona o usuário
 * logado para o próprio perfil e não tem conteúdo próprio. A página é client
 * component e não pode exportar metadata sozinha.
 *
 * Não afeta `/perfil/<handle>`: aquele segmento tem `generateMetadata`
 * próprio, que substitui o do layout — o perfil público continua indexável.
 */
export const metadata: Metadata = buildMetadata({
  title: "Meu perfil",
  description: "Seu perfil na Sunano.",
  path: "/perfil",
  noIndex: true,
})

export default function PerfilLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
