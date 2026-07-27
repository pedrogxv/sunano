"use client"

import { useEffect, useState } from "react"
import { Clock, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type TierlistMeta = {
  latestUpdateDescription: string
  updatedAt: string
}

export function TierlistMetaCard() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [description, setDescription] = useState("")
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/admin/tierlist-meta", { cache: "no-store" })
        const data = await res.json().catch(() => null) as { error?: string; meta?: TierlistMeta | null } | null
        if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar.")
        if (cancelled) return
        setDescription(data?.meta?.latestUpdateDescription ?? "")
        setUpdatedAt(data?.meta?.updatedAt ?? null)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Erro ao carregar."
        toast.error("Erro ao carregar Última Atualização", { description: message })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    try {
      setSaving(true)
      const res = await fetch("/api/admin/tierlist-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latestUpdateDescription: description }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean; meta?: TierlistMeta } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao salvar.")
      setUpdatedAt(data.meta?.updatedAt ?? new Date().toISOString())
      toast.success("Última Atualização salva")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar."
      toast.error("Erro ao salvar", { description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border bg-card/90">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-primary" />
          Última Atualização
        </CardTitle>
        <CardDescription>
          Texto exibido na aba &quot;Última Atualização&quot; do painel de informações da tierlist. A data é
          registrada automaticamente ao salvar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="As listas são atualizadas continuamente com..."
            maxLength={500}
            disabled={loading}
            rows={3}
            className="border-border bg-background"
          />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {updatedAt
              ? `Atualizado em ${new Date(updatedAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Ainda não foi salvo."}
          </p>
          <Button onClick={handleSave} disabled={loading || saving} className="gap-2 min-w-32">
            <Save className="size-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
