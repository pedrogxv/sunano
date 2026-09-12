/**
 * Skeleton da LISTAGEM — e o route group `(list)` existe por causa dele.
 *
 * Um `loading.tsx` vale como Suspense boundary para TODA rota abaixo dele na
 * árvore ("a loading.js high in the tree is a valid boundary" —
 * node_modules/next/dist/docs/01-app/02-guides/streaming.md). Enquanto este
 * arquivo morava no diretório pai, ele cobria também a rota de detalhe irmã
 * (`/perifericos/[slug]`): o stream começava, o Next se comprometia com
 * `200 OK` e o `notFound()` da página de detalhe não conseguia mais virar
 * 404 — respondia 200 com a tela "não encontrado" e um `<meta robots=
 * "noindex">` injetado. Soft-404 em toda URL inválida, que o Search Console
 * conta como página rastreada sem conteúdo.
 *
 * Dentro de `(list)` o boundary cobre só a listagem (route group não entra na
 * URL) e a rota de detalhe volta a devolver 404 de verdade. Mesmo arranjo de
 * `app/blog/(list)/` e `app/noticias/(list)/`. NÃO mover de volta para o pai.
 *
 * Ao testar isto: `next dev` rodando em paralelo recria o cache de `.next` e
 * falseia o status — use `rm -rf .next && next build && next start`.
 */
import { Skeleton } from "@/components/ui/skeleton"

export default function PerifericosLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 py-8 sm:px-4 md:px-6 lg:px-8">
      {/* Hero */}
      <Skeleton className="h-40 w-full rounded-2xl" />

      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
