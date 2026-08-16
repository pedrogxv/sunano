"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
] as const

export default function SolicitarAfiliacaoPage() {
  const router = useRouter()
  const [pixKey, setPixKey] = useState("")
  const [pixKeyType, setPixKeyType] = useState<(typeof PIX_KEY_TYPES)[number]["value"]>("cpf")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/afiliados/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixKey, pixKeyType }),
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

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">Quero ser afiliado</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Informe a chave PIX que receberá seus saques. Sua solicitação passa por uma análise
        manual antes de ser aprovada.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Dados para saque</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
