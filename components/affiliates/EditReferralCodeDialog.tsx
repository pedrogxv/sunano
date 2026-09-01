"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { normalizeAffiliateCode, validateAffiliateCode } from "@/lib/affiliate-code"
import { resetAffiliateCodeCache } from "@/lib/hooks/use-affiliate-code"
import { cn } from "@/lib/utils"

type CodeCheckState = "idle" | "checking" | "available" | "unavailable"

export function EditReferralCodeDialog({ currentCode }: { currentCode: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(currentCode)
  const [codeState, setCodeState] = useState<CodeCheckState>("idle")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCode(currentCode)
      setCodeState("idle")
      setCodeError(null)
      setError(null)
    }
  }, [open, currentCode])

  useEffect(() => {
    const normalized = normalizeAffiliateCode(code)

    if (!normalized || normalized === normalizeAffiliateCode(currentCode)) {
      setCodeState("idle")
      setCodeError(null)
      return
    }

    const formatError = validateAffiliateCode(normalized)
    if (formatError) {
      setCodeState("unavailable")
      setCodeError(formatError)
      return
    }

    setCodeState("checking")
    setCodeError(null)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/afiliados/code-check?code=${encodeURIComponent(normalized)}`)
        const data = await res.json()
        if (data.available) {
          setCodeState("available")
          setCodeError(null)
        } else {
          setCodeState("unavailable")
          setCodeError(data.error ?? "Esse código já está em uso. Escolha outro.")
        }
      } catch {
        setCodeState("unavailable")
        setCodeError("Não foi possível verificar o código agora.")
      }
    }, 400)

    return () => clearTimeout(timeout)
  }, [code, currentCode])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (codeState !== "available") return

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/afiliados/code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Não foi possível alterar o código.")
        return
      }
      setOpen(false)
      // O botão de copiar link guarda o código em cache de módulo; sem isto
      // ele continuaria montando a URL com o código antigo até dar reload.
      resetAffiliateCodeCache()
      router.refresh()
    } catch {
      setError("Não foi possível alterar o código.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-3.5" />
          Alterar código
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar código de indicação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Novo código</label>
            <div className="relative">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="MEUCODIGO"
                required
                minLength={4}
                maxLength={20}
                autoFocus
                className={cn(
                  "pr-9 uppercase",
                  codeState === "unavailable" && "border-destructive focus-visible:ring-destructive",
                  codeState === "available" && "border-emerald-500 focus-visible:ring-emerald-500"
                )}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                {codeState === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {codeState === "available" && <Check className="size-4 text-emerald-500" />}
                {codeState === "unavailable" && <X className="size-4 text-destructive" />}
              </span>
            </div>
            {codeError && <p className="mt-1 text-sm text-destructive">{codeError}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              Links já compartilhados com o código atual param de funcionar assim que você trocar.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={codeState !== "available" || isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar novo código"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
