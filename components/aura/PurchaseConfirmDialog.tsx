"use client"

import { Loader2 } from "lucide-react"

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

interface PurchaseConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nome do item, aparece em destaque na pergunta. */
  itemName: string
  /** Custo em Aura do item. */
  cost: number
  /** Saldo atual do usuário — usado para mostrar o saldo restante. */
  balance: number
  /** Texto do botão de confirmação. */
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
}

// A moeda é sempre Aura (🔥) — o 🧊 do card de escudo é só a arte, não a moeda.
const AURA_ICON = "🔥"

export function PurchaseConfirmDialog({
  open,
  onOpenChange,
  itemName,
  cost,
  balance,
  confirmLabel = "Confirmar compra",
  loading = false,
  onConfirm,
}: PurchaseConfirmDialogProps) {
  const remaining = balance - cost

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar compra</AlertDialogTitle>
          <AlertDialogDescription>
            Você vai gastar{" "}
            <span className="font-semibold text-foreground">
              {AURA_ICON} {cost.toLocaleString("pt-BR")}
            </span>{" "}
            de Aura em <span className="font-semibold text-foreground">{itemName}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium">
          <span className="text-muted-foreground">Saldo após a compra</span>
          <span className="font-display font-bold tabular-nums text-foreground">
            {AURA_ICON} {remaining.toLocaleString("pt-BR")}
          </span>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Não fecha sozinho: o card controla o open via onOpenChange
              // depois que a request termina (evita fechar antes do erro).
              event.preventDefault()
              onConfirm()
            }}
            disabled={loading}
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
