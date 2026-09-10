"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  REFERRAL_CODE_MAX_LENGTH,
  normalizeReferralCode,
  validateReferralCode,
} from "@/lib/referral-code"

/**
 * Personalização do cupom — uma vez só.
 *
 * O diálogo é explícito sobre isso ANTES de salvar (e não só depois, num erro)
 * porque a escolha é irreversível: links já compartilhados param de valer
 * quando o código muda, então a pessoa precisa decidir com essa informação em
 * mãos. O botão nem aparece para quem já usou a troca.
 */
export function EditReferralCodeDialog({ currentCode }: { currentCode: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(currentCode)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setCode(currentCode)
      setError(null)
    }
  }, [open, currentCode])

  const localError = code && code !== currentCode ? validateReferralCode(code) : null

  async function submit() {
    const normalized = normalizeReferralCode(code)
    const invalid = validateReferralCode(normalized)
    if (invalid) {
      setError(invalid)
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/indicacoes/code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? "Não foi possível salvar.")
        return
      }
      toast.success("Cupom atualizado!", {
        description: "Compartilhe o link novo: o anterior não vale mais.",
      })
      setOpen(false)
      router.refresh()
    } catch {
      setError("Não foi possível salvar. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Pencil className="size-3.5" />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personalizar seu cupom</DialogTitle>
          <DialogDescription>
            Você pode trocar seu cupom <strong>uma única vez</strong>. Depois de salvar, o cupom
            antigo deixa de funcionar; quem já tiver seu link antigo precisará do novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={REFERRAL_CODE_MAX_LENGTH}
            placeholder="SEUCUPOM"
            className="font-mono uppercase tracking-widest"
          />
          {(localError || error) && (
            <p className="text-xs text-destructive">{localError ?? error}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Letras e números, de 4 a {REFERRAL_CODE_MAX_LENGTH} caracteres.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={isSubmitting || Boolean(localError) || !code || code === currentCode}
            className="gap-2"
            type="button"
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Salvar cupom
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
