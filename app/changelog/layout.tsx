import type { Metadata } from "next"

// `page.tsx` do changelog é "use client" (usa useT), e Client Component não
// pode exportar `metadata` — daí este layout, que existe só para dar título e
// canonical próprios à rota em vez de herdar os da home.
export const metadata: Metadata = {
  title: "Changelog",
  description: "Todas as novidades, melhorias e correções lançadas na Sunano, versão por versão.",
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: "Changelog Sunano",
    description: "Todas as novidades, melhorias e correções lançadas na Sunano, versão por versão.",
    url: "/changelog",
    type: "website",
  },
}

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children
}
