import { StoreLandingSkeleton } from "@/components/store/StoreLandingSkeleton"

/**
 * O 404 de slug inválido NÃO pode ficar só na página: este boundary começa a
 * transmitir antes dela e travaria o status em 200 (soft-404, ver
 * `app/perifericos/(list)/loading.tsx`). Quem valida o slug é o `layout.tsx`
 * ao lado, que fica fora do boundary.
 */
export default function Loading() {
  return <StoreLandingSkeleton />
}
