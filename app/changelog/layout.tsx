import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

// `page.tsx` do changelog é "use client" (usa useT), e Client Component não
// pode exportar `metadata` — daí este layout, que existe só para dar título e
// canonical próprios à rota em vez de herdar os da home.
export const metadata: Metadata = buildMetadata({
  title: "Changelog",
  socialTitle: "Changelog: tudo que mudou no site",
  description: "Todas as novidades, melhorias e correções lançadas na Sunano, versão por versão, com data de cada entrega.",
  path: "/changelog",
  eyebrow: "Changelog",
  subtitle: "Novidades versão por versão",
})

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children
}
