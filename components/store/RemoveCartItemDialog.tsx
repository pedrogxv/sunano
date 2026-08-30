"use client"

import { Package } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatBRL } from "@/lib/format"

export type PendingRemoval = {
  productId: string
  variantId: string | null
  optionIds: string[]
  name: string
  image: string | null
  quantity: number
  priceCents: number
  /** `true` quando veio de diminuir a quantidade de 1 para 0, não da lixeira. */
  fromDecrement?: boolean
}

/**
 * Confirmação de remoção de um item do carrinho — pela lixeira ou ao zerar a
 * quantidade no "−". Tirar um produto do carrinho por clique errado é
 * silencioso e sem desfazer (o carrinho vive no localStorage), então vale um
 * passo a mais. Compartilhado entre o CartDrawer e a página de checkout para
 * a pergunta ser a mesma nos dois lugares.
 */
export function RemoveCartItemDialog({
  pending,
  onOpenChange,
  onConfirm,
  elevated = false,
}: {
  pending: PendingRemoval | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  /** Aberto de dentro do CartDrawer (z-[61]) — sobe o diálogo acima dele. */
  elevated?: boolean
}) {
  return (
    <AlertDialog open={pending !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={elevated ? "z-[70]" : undefined}
        overlayClassName={elevated ? "z-[69]" : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Remover do carrinho?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.fromDecrement
              ? "Essa é a última unidade — diminuir mais tira o produto do carrinho."
              : "O produto sai do carrinho. Você pode adicioná-lo de novo depois."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pending && (
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/50 p-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-[var(--card-image-bg)]">
              {pending.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pending.image} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <Package className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{pending.name}</p>
              <p className="text-xs text-muted-foreground">
                {pending.quantity} {pending.quantity === 1 ? "unidade" : "unidades"} ·{" "}
                {formatBRL(pending.priceCents * pending.quantity)}
              </p>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Manter no carrinho</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-500">
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
