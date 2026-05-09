"use client"

import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent } from "react"
import { Upload, Camera, KeyRound, Youtube, RefreshCw, CheckCircle2, AlertTriangle, Clock, User } from "lucide-react"

import BoxLoader from "@/components/ui/box-loader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useLocale } from "@/lib/locale-context"

type AdminProfile = {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  role: "admin" | "moderator" | "webmaster"
  permissions: Record<string, boolean>
}

function getNameFallback(email: string | null | undefined) {
  if (!email) return "Admin"
  const [localPart] = email.split("@")
  return localPart || "Admin"
}

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ].filter(Boolean).length

  const labels = ["", "Fraca", "Razoável", "Boa", "Forte", "Muito forte"]
  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"]

  if (!password) return null

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <p className={`text-[10px] font-medium ${score >= 4 ? "text-emerald-400" : score >= 2 ? "text-yellow-400" : "text-red-400"}`}>
        {labels[score]}
      </p>
    </div>
  )
}

export default function SettingsPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [role, setRole] = useState<"admin" | "moderator" | "webmaster">("admin")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [videoStatusLoading, setVideoStatusLoading] = useState(false)
  const [videoRefreshing, setVideoRefreshing] = useState(false)
  const [videoStatus, setVideoStatus] = useState<{
    hasSnapshot: boolean
    fetchedAt: string | null
    stale: boolean
    lastError: string | null
  } | null>(null)

  useEffect(() => {
    loadProfile()
    loadVideoSnapshotStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadVideoSnapshotStatus() {
    try {
      setVideoStatusLoading(true)
      const res = await fetch("/api/admin/videos/refresh", { method: "GET" })
      const data = await res.json().catch(() => null) as { error?: string; status?: typeof videoStatus } | null
      if (!res.ok || !data?.status) throw new Error(data?.error ?? "")
      setVideoStatus(data.status)
    } catch { /* ignore */ } finally {
      setVideoStatusLoading(false)
    }
  }

  async function refreshVideoSnapshot() {
    try {
      setVideoRefreshing(true)
      setError(null)
      setSuccess(null)
      const res = await fetch("/api/admin/videos/refresh", { method: "POST" })
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; warning?: string | null; status?: typeof videoStatus } | null
      if (!res.ok || !data?.status) throw new Error(data?.error ?? "")
      setVideoStatus(data.status)
      setSuccess(data.warning ?? (isEnglish ? "YouTube snapshot refreshed." : "Snapshot do YouTube atualizado."))
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to refresh" : "Erro ao atualizar"))
    } finally {
      setVideoRefreshing(false)
    }
  }

  async function loadProfile() {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/profile", { method: "GET" })
      const data = await res.json().catch(() => null) as { error?: string; profile?: AdminProfile } | null
      if (!res.ok || !data?.profile) throw new Error(data?.error ?? "")
      setEmail(data.profile.email)
      setDisplayName(data.profile.display_name)
      setAvatarUrl(data.profile.avatar_url)
      setAvatarPreview(data.profile.avatar_url)
      setRole(data.profile.role)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load profile" : "Erro ao carregar perfil"))
    } finally {
      setLoading(false)
    }
  }

  async function handleAvatarSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      setError(null)
      setSuccess(null)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(file)
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/admin/profile/upload-avatar", { method: "POST", body })
      const data = await res.json().catch(() => null) as { error?: string; publicUrl?: string } | null
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "")
      setAvatarUrl(data.publicUrl)
      setAvatarPreview(data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to upload avatar" : "Erro ao enviar avatar"))
    } finally {
      setUploading(false)
    }
  }

  async function saveProfile() {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      const res = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, avatar_url: avatarUrl }),
      })
      const data = await res.json().catch(() => null) as { error?: string; profile?: AdminProfile } | null
      if (!res.ok || !data?.profile) throw new Error(data?.error ?? "")
      setDisplayName(data.profile.display_name)
      setEmail(data.profile.email)
      setAvatarUrl(data.profile.avatar_url)
      setAvatarPreview(data.profile.avatar_url)
      setRole(data.profile.role)
      setSuccess(isEnglish ? "Profile saved successfully." : "Perfil salvo com sucesso.")
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save profile" : "Erro ao salvar perfil"))
    } finally {
      setSaving(false)
    }
  }

  async function updatePassword() {
    setPasswordError(null)
    setPasswordSuccess(false)
    if (newPassword.length < 8) {
      setPasswordError(isEnglish ? "Password must be at least 8 characters." : "A senha deve ter no mínimo 8 caracteres.")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(isEnglish ? "Passwords do not match." : "As senhas não conferem.")
      return
    }
    try {
      const res = await fetch("/api/admin/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordSuccess(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : (isEnglish ? "Failed to change password" : "Erro ao alterar senha"))
    }
  }

  const previewName = useMemo(() => displayName.trim() || getNameFallback(email), [displayName, email])
  const roleLabel = role === "webmaster" ? "WEB Master" : role === "moderator" ? (isEnglish ? "Moderator" : "Moderador") : "Admin"

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{isEnglish ? "Settings" : "Configurações"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEnglish ? "Manage your profile and system preferences." : "Gerencie seu perfil e preferências do sistema."}
        </p>
      </div>

      {/* Global messages */}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>}

      {/* ── Profile card ── */}
      <Card className="border-border bg-card/90 overflow-hidden">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-primary" />
            {isEnglish ? "Admin profile" : "Perfil do admin"}
          </CardTitle>
          <CardDescription>
            {isEnglish
              ? "Your name and photo appear as authorship on blog articles."
              : "Seu nome e foto aparecem como autoria nos artigos do blog."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Avatar + info */}
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="relative shrink-0">
              <Avatar className="size-24 border-2 border-border shadow-lg">
                <AvatarImage src={avatarPreview ?? undefined} alt={previewName} />
                <AvatarFallback className="text-2xl font-bold">{previewName.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <label className={`absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-md transition-colors ${uploading ? "bg-muted animate-pulse" : "bg-primary hover:bg-primary/90"}`}>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarSelect} disabled={uploading} />
                <Camera className="size-3.5 text-primary-foreground" />
              </label>
            </div>

            {/* Name & role */}
            <div className="flex-1 space-y-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <p className="text-lg font-semibold text-foreground">{previewName}</p>
                <Badge variant="secondary" className="text-xs">{roleLabel}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{email ?? "-"}</p>
              <p className="text-xs text-muted-foreground/60">
                {isEnglish ? "This name appears on published articles." : "Este nome aparece nos artigos publicados."}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Email (readonly) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Account email" : "Email da conta"}</label>
              <Input value={email ?? "-"} readOnly className="border-border bg-muted/20 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground/60">{isEnglish ? "Cannot be changed here." : "Não pode ser alterado aqui."}</p>
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Display name" : "Nome de exibição"}</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="border-border bg-background"
                placeholder={isEnglish ? "e.g. Pedro" : "ex: Pedro"}
                maxLength={80}
              />
              <p className="text-[10px] text-muted-foreground">
                {isEnglish ? "Preview: " : "Prévia: "}<span className="text-foreground font-medium">{previewName}</span>
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={saveProfile} disabled={saving || uploading} className="gap-2 min-w-32">
              {saving ? (isEnglish ? "Saving..." : "Salvando...") : (isEnglish ? "Save profile" : "Salvar perfil")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Password card (webmaster only) ── */}
      {role === "webmaster" && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="border-b border-amber-500/20">
            <CardTitle className="flex items-center gap-2 text-base text-amber-200">
              <KeyRound className="size-4" />
              {isEnglish ? "Change password" : "Alterar senha"}
            </CardTitle>
            <CardDescription className="text-amber-200/60">
              {isEnglish ? "Exclusive to WEB Master." : "Exclusivo para o WEB Master."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {passwordError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{passwordError}</div>
            )}
            {passwordSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                {isEnglish ? "Password updated successfully." : "Senha atualizada com sucesso."}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "New password" : "Nova senha"}</label>
                <Input
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false) }}
                  className="border-amber-500/20 bg-background"
                  placeholder={isEnglish ? "Min. 8 characters" : "Mín. 8 caracteres"}
                  type="password"
                />
                <PasswordStrength password={newPassword} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Confirm password" : "Confirmar senha"}</label>
                <Input
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSuccess(false) }}
                  className={`border-amber-500/20 bg-background ${confirmPassword && confirmPassword !== newPassword ? "border-red-500/50" : ""}`}
                  placeholder={isEnglish ? "Repeat the password" : "Repita a senha"}
                  type="password"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[10px] text-red-400">{isEnglish ? "Passwords do not match" : "As senhas não conferem"}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-amber-500/20 pt-4">
              <Button
                onClick={updatePassword}
                disabled={!newPassword || newPassword !== confirmPassword}
                className="gap-2 bg-amber-500 text-black hover:bg-amber-400 min-w-32"
              >
                <KeyRound className="size-4" />
                {isEnglish ? "Update password" : "Atualizar senha"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── YouTube sync card ── */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Youtube className="size-4 text-red-400" />
            {isEnglish ? "YouTube sync" : "Sincronização YouTube"}
          </CardTitle>
          <CardDescription>
            {isEnglish
              ? "Daily snapshot used on the public videos page. Refresh manually if needed."
              : "Snapshot diário usado na página pública de vídeos. Atualize manualmente se necessário."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {/* Status row */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 p-3">
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${videoStatus?.hasSnapshot ? "bg-emerald-500/15" : "bg-muted"}`}>
                {videoStatus?.hasSnapshot
                  ? <CheckCircle2 className="size-4 text-emerald-400" />
                  : <AlertTriangle className="size-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Snapshot</p>
                <p className="text-sm font-medium text-foreground">
                  {videoStatusLoading ? "..." : videoStatus?.hasSnapshot
                    ? (isEnglish ? "Available" : "Disponível")
                    : (isEnglish ? "Not available" : "Indisponível")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Clock className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isEnglish ? "Last sync" : "Última sync"}</p>
                <p className="text-sm font-medium text-foreground">
                  {videoStatus?.fetchedAt
                    ? new Date(videoStatus.fetchedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "-"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 p-3">
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${videoStatus?.stale ? "bg-amber-500/15" : "bg-emerald-500/10"}`}>
                <RefreshCw className={`size-4 ${videoStatus?.stale ? "text-amber-400" : "text-emerald-400"}`} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                <p className="text-sm font-medium text-foreground">
                  {videoStatus?.stale
                    ? (isEnglish ? "Outdated" : "Desatualizado")
                    : (isEnglish ? "Up to date" : "Atualizado")}
                </p>
              </div>
            </div>
          </div>

          {videoStatus?.lastError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{videoStatus.lastError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={loadVideoSnapshotStatus} disabled={videoStatusLoading || videoRefreshing} size="sm">
              {videoStatusLoading ? (isEnglish ? "Refreshing..." : "Atualizando...") : (isEnglish ? "Reload status" : "Recarregar status")}
            </Button>
            <Button onClick={refreshVideoSnapshot} disabled={videoRefreshing || videoStatusLoading} size="sm" className="gap-2">
              <RefreshCw className={`size-4 ${videoRefreshing ? "animate-spin" : ""}`} />
              {videoRefreshing ? (isEnglish ? "Syncing..." : "Sincronizando...") : (isEnglish ? "Force refresh" : "Forçar atualização")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
