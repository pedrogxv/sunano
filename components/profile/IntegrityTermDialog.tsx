"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface IntegrityTermDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** POST no endpoint de aceite + atualização do estado local — feito pelo pai. */
  onAccept: () => Promise<void>
}

/**
 * Termo de integridade (item 1.2) — exibido só na primeira vez que o usuário
 * for criar uma review. Texto exato do spec, sem paráfrase.
 */
export function IntegrityTermDialog({ open, onOpenChange, onAccept }: IntegrityTermDialogProps) {
  const [checked, setChecked] = useState(false)
  const [accepting, setAccepting] = useState(false)

  async function handleAccept() {
    setAccepting(true)
    try {
      await onAccept()
      onOpenChange(false)
    } finally {
      setAccepting(false)
      setChecked(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Termo de integridade das avaliações</DialogTitle>
          <DialogDescription className="text-foreground/90">
            Atenção: para mantermos a integridade e prezar por uma forma justa de avaliar, é
            necessário que o usuário já tenha usado o periférico. Exigimos isso por achar
            necessário que o usuário tenha pelo menos experimentado o periférico para propor um
            review justo, sem se basear em achismo ou influencers leigos. Caso seja descoberto que
            o usuário infringiu esse acordo, a Staff do site poderá remover todos os seus reviews e
            zerar sua pontuação de Aura, assim como revogar premiações advindas do farm de Aura.
            Sim, VAI PERDER AURA e seus benefícios.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
          Li e estou de acordo com as exigências do site para cumprir com o que foi estabelecido
        </label>

        <DialogFooter>
          <Button type="button" onClick={handleAccept} disabled={!checked || accepting} className="gap-2">
            {accepting && <Loader2 className="size-4 animate-spin" />}
            Aceitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
