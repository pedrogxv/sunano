import { Skeleton } from "@/components/ui/skeleton"

/**
 * Override do `loading.tsx` do segmento pai (`app/tierlist/loading.tsx`, um
 * esqueleto de board com largura `max-w-6xl`). A tierlist pessoal usa
 * `max-w-4xl` e um painel do dono, não o board da tierlist oficial — sem
 * este override o fallback aparece com o layout errado (e o Next trata
 * `loading.tsx` do pai vazando pro filho como soft-404).
 */
export default function TierlistPessoalLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
