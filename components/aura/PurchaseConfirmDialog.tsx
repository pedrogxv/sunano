"use client"

import { Crown, Loader2 } from "lucide-react"

import { auraPriceForVip } from "@/lib/aura-pricing"

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
  /** Preço de tabela em Aura — sempre o valor cheio, sem desconto. */
  listPrice: number
  /** VIP ativo agora: cobra e exibe o preço com 10% de desconto. */
  isVip: boolean
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
  listPrice,
  isVip,
  balance,
  confirmLabel = "Confirmar compra",
  loading = false,
  onConfirm,
}: PurchaseConfirmDialogProps) {
  const price = auraPriceForVip(listPrice, isVip)
  const remaining = balance - price.finalPrice

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar compra</AlertDialogTitle>
          <AlertDialogDescription>
            Você vai gastar{" "}
            <span className="font-semibold text-foreground">
              {AURA_ICON} {price.finalPrice.toLocaleString("pt-BR")}
            </span>{" "}
            de Aura em <span className="font-semibold text-foreground">{itemName}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-px overflow-hidden rounded-lg border border-border bg-muted/40 text-xs font-medium">
          {/* Só VIP vê o detalhamento — para conta comum "preço − 0" seria
              uma linha inútil insinuando um desconto que ele não tem. */}
          {price.discounted && (
            <>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-muted-foreground">Preço do item</span>
                <span className="font-display font-bold tabular-nums text-muted-foreground line-through">
                  {AURA_ICON} {price.listPrice.toLocaleString("pt-BR")}
                </span>
              </div>
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ color: "var(--vip-accent)" }}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <Crown className="size-3.5" strokeWidth={2} />
                  Desconto VIP ({price.discountPercent}%)
                </span>
                <span className="font-display font-bold tabular-nums">
                  −{AURA_ICON} {price.savings.toLocaleString("pt-BR")}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
            <span className="text-muted-foreground">Saldo após a compra</span>
            <span className="font-display font-bold tabular-nums text-foreground">
              {AURA_ICON} {remaining.toLocaleString("pt-BR")}
            </span>
          </div>
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
