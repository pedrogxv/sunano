import { PublicSidebar } from "@/components/layout/PublicSidebar"

export default function NoticiasPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pt-16">
      <div className="flex">
        <div className="hidden md:flex md:sticky md:top-16 md:h-[calc(100vh-64px)] md:shrink-0">
          <PublicSidebar />
        </div>

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8 space-y-4">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Noticias
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Atualizacoes, anuncios e novidades da Sunano em um so lugar.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                Em breve: feed de noticias com filtros, categorias e destaques.
              </p>
            </div>
          </div>
        </main>
      </div>

      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}
