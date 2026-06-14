"use client"

import { useState } from "react"
import type { ChangeEvent } from "react"
import { Camera } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export type ProfileData = {
  email: string | null
  display_name: string
  avatar_url: string | null
  theme: string | null
  locale: string | null
  lgpd_consent_at?: string | null
  lgpd_consent_version?: string | null
}

interface ProfileTabProps {
  profile: ProfileData
  onProfileChange: (profile: ProfileData) => void
}

export function ProfileTab({ profile, onProfileChange }: ProfileTabProps) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const previewName = displayName.trim() || (profile.email?.split("@")[0] ?? "Usuário")

  async function handleAvatarSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(file)
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/profile/upload-avatar", { method: "POST", body })
      const data = (await res.json().catch(() => null)) as { error?: string; publicUrl?: string } | null
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "")
      setAvatarUrl(data.publicUrl)
      setAvatarPreview(data.publicUrl)
      toast.success("Avatar enviado")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao enviar avatar"
      setAvatarPreview(avatarUrl)
      toast.error("Erro ao enviar avatar", { description: message })
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    try {
      setSaving(true)
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, avatar_url: avatarUrl }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; profile?: ProfileData } | null
      if (!res.ok || !data?.profile) throw new Error(data?.error ?? "")
      setDisplayName(data.profile.display_name)
      setAvatarUrl(data.profile.avatar_url)
      setAvatarPreview(data.profile.avatar_url)
      onProfileChange(data.profile)
      toast.success("Perfil salvo")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao salvar perfil"
      toast.error("Erro ao salvar perfil", { description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border bg-card/90 overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Perfil</CardTitle>
        <CardDescription>Seu nome e foto aparecem no fórum e nas suas atividades.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <Avatar className="size-24 border-2 border-border shadow-lg">
              <AvatarImage src={avatarPreview ?? undefined} alt={previewName} />
              <AvatarFallback className="text-2xl font-bold">{previewName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <label
              className={`absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-md transition-colors ${uploading ? "bg-muted animate-pulse" : "bg-primary hover:bg-primary/90"}`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
                disabled={uploading}
              />
              <Camera className="size-3.5 text-primary-foreground" />
            </label>
          </div>

          <div className="flex-1 space-y-1 text-center sm:text-left">
            <p className="text-lg font-semibold text-foreground">{previewName}</p>
            <p className="text-sm text-muted-foreground">{profile.email ?? "-"}</p>
            <p className="text-xs text-muted-foreground/60">JPG, PNG ou WEBP até 3MB.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email da conta</label>
            <Input value={profile.email ?? "-"} readOnly className="border-border bg-muted/20 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground/60">Não pode ser alterado.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome de exibição</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border-border bg-background"
              placeholder="ex: Pedro"
              maxLength={80}
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={save} disabled={saving || uploading} className="min-w-32">
            {saving ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
