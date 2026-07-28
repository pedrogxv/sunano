"use client"

import { useState } from "react"
import type { ChangeEvent } from "react"
import Link from "next/link"
import { Camera, ExternalLink, ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { coerceAccountTier, canUseAnimatedMedia } from "@/lib/account-tier"
import { BIO_MAX_LENGTH } from "@/lib/profile-showcase"

export type ProfileData = {
  id?: string
  email: string | null
  display_name: string
  avatar_url: string | null
  theme: string | null
  locale: string | null
  lgpd_consent_at?: string | null
  lgpd_consent_version?: string | null
  banner_url?: string | null
  bio?: string | null
  account_tier?: string | null
}

interface ProfileTabProps {
  profile: ProfileData
  onProfileChange: (profile: ProfileData) => void
}

export function ProfileTab({ profile, onProfileChange }: ProfileTabProps) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url)
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile.banner_url ?? null)
  const [bio, setBio] = useState(profile.bio ?? "")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

  const previewName = displayName.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const tier = coerceAccountTier(profile.account_tier)
  const allowsGif = canUseAnimatedMedia(tier)
  // GIF só entra no seletor de arquivos de quem pode usá-lo; a API valida de novo.
  const imageAccept = allowsGif
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "image/jpeg,image/png,image/webp"

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

  async function handleBannerSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setUploadingBanner(true)
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/profile/upload-banner", { method: "POST", body })
      const data = (await res.json().catch(() => null)) as { error?: string; publicUrl?: string } | null
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "")
      setBannerUrl(data.publicUrl)
      toast.success("Banner enviado")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao enviar banner"
      toast.error("Erro ao enviar banner", { description: message })
    } finally {
      setUploadingBanner(false)
    }
  }

  async function save() {
    try {
      setSaving(true)
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
          bio,
        }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; profile?: ProfileData } | null
      if (!res.ok || !data?.profile) throw new Error(data?.error ?? "")
      setDisplayName(data.profile.display_name)
      setAvatarUrl(data.profile.avatar_url)
      setAvatarPreview(data.profile.avatar_url)
      setBannerUrl(data.profile.banner_url ?? null)
      setBio(data.profile.bio ?? "")
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
        {/* Banner da vitrine pública */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Banner do perfil
          </label>
          <label
            className="relative flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/20 transition-colors hover:border-primary/40 sm:h-36"
            style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            <input
              type="file"
              accept={imageAccept}
              className="hidden"
              onChange={handleBannerSelect}
              disabled={uploadingBanner}
            />
            <span
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${bannerUrl ? "bg-background/80 text-foreground" : "text-muted-foreground"} ${uploadingBanner ? "animate-pulse" : ""}`}
            >
              <ImagePlus className="size-4" />
              {uploadingBanner ? "Enviando..." : bannerUrl ? "Trocar banner" : "Enviar banner"}
            </span>
          </label>
          <p className="text-[10px] text-muted-foreground/60">
            {allowsGif
              ? "JPG, PNG, WEBP ou GIF animado até 5MB."
              : "JPG, PNG ou WEBP até 5MB. GIF animado é exclusivo para membros VIP."}
          </p>
        </div>

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
                accept={imageAccept}
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

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bio</label>
            <span className="text-[10px] text-muted-foreground/60">
              {bio.length}/{BIO_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
            className="border-border bg-background min-h-20 resize-none"
            placeholder="Uma linha sobre você — aparece no seu perfil público."
            maxLength={BIO_MAX_LENGTH}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {profile.id ? (
            <Link
              href={`/perfil/${profile.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
              Ver meu perfil público
            </Link>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={saving || uploading || uploadingBanner} className="min-w-32">
            {saving ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
