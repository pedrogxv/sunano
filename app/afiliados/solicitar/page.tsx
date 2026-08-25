"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normalizeAffiliateCode, validateAffiliateCode } from "@/lib/affiliate-code"
import { SITE_URL } from "@/lib/site-url"
import { cn } from "@/lib/utils"

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
] as const

type CodeCheckState = "idle" | "checking" | "available" | "unavailable"

export default function SolicitarAfiliacaoPage() {
  const router = useRouter()
  const [pixKey, setPixKey] = useState("")
  const [pixKeyType, setPixKeyType] = useState<(typeof PIX_KEY_TYPES)[number]["value"]>("cpf")
  const [code, setCode] = useState("")
  const [codeState, setCodeState] = useState<CodeCheckState>("idle")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ownCodeRef = useRef<string | null>(null)

  // Pré-preenche em caso de reenvio (solicitação anterior rejeitada) — o
  // código já existente aparece pronto para reaproveitar ou trocar.
  useEffect(() => {
    fetch("/api/afiliados/me")
      .then((res) => res.json())
      .then((data) => {
        const affiliate = data?.affiliate
        if (affiliate?.status === "rejected") {
          if (affiliate.code) {
            setCode(affiliate.code)
            ownCodeRef.current = normalizeAffiliateCode(affiliate.code)
          }
          if (affiliate.pix_key) setPixKey(affiliate.pix_key)
          if (affiliate.pix_key_type) setPixKeyType(affiliate.pix_key_type)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const normalized = normalizeAffiliateCode(code)

    if (!normalized) {
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

    if (normalized === ownCodeRef.current) {
      setCodeState("available")
      setCodeError(null)
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
  }, [code])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (codeState !== "available") return

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/afiliados/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixKey, pixKeyType, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar sua solicitação.")
        return
      }
      router.push("/afiliados")
      router.refresh()
    } catch {
      setError("Não foi possível enviar sua solicitação.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = codeState === "available" && !isSubmitting

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">Quero ser afiliado</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Escolha o código que vai aparecer no seu link de indicação e informe a chave PIX que
        receberá seus saques. Sua solicitação passa por uma análise manual antes de ser aprovada.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Dados da solicitação</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Código de indicação</label>
              <div className="relative">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="MEUCODIGO"
                  required
                  minLength={4}
                  maxLength={20}
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
              <p className="mt-1 text-xs text-muted-foreground">
                Aparecerá no seu link: {SITE_URL.replace(/^https?:\/\//, "")}/?ref=
                <span className="font-medium">{normalizeAffiliateCode(code) || "SEUCODIGO"}</span>
              </p>
              {codeError && <p className="mt-1 text-sm text-destructive">{codeError}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Tipo de chave PIX</label>
              <select
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value as typeof pixKeyType)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {PIX_KEY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Chave PIX</label>
              <Input
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Sua chave PIX"
                required
                minLength={3}
                maxLength={200}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {isSubmitting ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
