"use client"

import { HelpCircle, Package, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const CONDITIONS = [
  {
    label: "Novo",
    style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Produto lacrado, direto de fornecedor — nunca usado.",
  },
  {
    label: "Embalagem aberta",
    style: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Caixa aberta (às vezes sem lacre), mas o produto em si nunca foi usado.",
  },
  {
    label: "Usado",
    style: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    description: "Produto de segunda mão, testado e aprovado pelo Sunano antes de ir para a venda.",
  },
] as const

/** Botão de ajuda + modal explicando os termos do Mercado (Loja, condições). */
export function MarketInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Como funciona o Mercado"
        >
          <HelpCircle className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como funciona o Mercado</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <ShoppingBag className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Loja</p>
              <p className="text-muted-foreground">
                Produtos novos, selecionados e testados pelo Sunano, vendidos por fornecedores parceiros.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Package className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Estado do produto</p>
              <div className="mt-2 space-y-2">
                {CONDITIONS.map((c) => (
                  <div key={c.label} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.style}`}
                    >
                      {c.label}
                    </span>
                    <p className="text-muted-foreground">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
