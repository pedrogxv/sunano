/**
 * Skeleton da LISTAGEM — e o route group `(list)` existe por causa dele.
 *
 * Um `loading.tsx` vale como Suspense boundary para TODA rota abaixo dele na
 * árvore ("a loading.js high in the tree is a valid boundary" —
 * node_modules/next/dist/docs/01-app/02-guides/streaming.md). Enquanto este
 * arquivo morava no diretório pai, ele cobria também a rota de detalhe irmã
 * (`/forum/[slug]`): o stream começava, o Next se comprometia com
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
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

export default function ForumLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-8 sm:px-4 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
      </div>

      <Skeleton className="h-11 w-full rounded-xl" />

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn("flex items-start gap-3 rounded-xl p-4", CARD_SURFACE)}>
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="mt-3 flex items-center gap-2">
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-6 w-12 rounded-full" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
