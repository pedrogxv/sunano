"use client"

import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent } from "react"
import { Upload, Camera, KeyRound, Youtube, RefreshCw, CheckCircle2, AlertTriangle, Clock, User, CreditCard } from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/use-t"
import { adminRoleLabel } from "@/components/people/RoleBadge"
import type { AdminRole } from "@/lib/admin-permissions"

type AdminProfile = {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  role: AdminRole
  permissions: Record<string, boolean>
}

function getNameFallback(email: string | null | undefined) {
  if (!email) return "Admin"
  const [localPart] = email.split("@")
  return localPart || "Admin"
}

export default function SettingsPage() {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [role, setRole] = useState<AdminRole>("admin")
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
  const [storeSettingsLoading, setStoreSettingsLoading] = useState(true)
  const [storeSettingsSaving, setStoreSettingsSaving] = useState(false)
  const [cardSurchargePercent, setCardSurchargePercent] = useState("5")
  const [cardMaxInstallments, setCardMaxInstallments] = useState("6")

  useEffect(() => {
    loadProfile()
    loadVideoSnapshotStatus()
    loadStoreSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStoreSettings() {
    try {
      setStoreSettingsLoading(true)
      const res = await fetch("/api/admin/store-settings", { method: "GET" })
      if (!res.ok) return // 403 pra quem não é webmaster — card nem aparece
      const data = (await res.json()) as { cardSurchargePercent?: number; cardMaxInstallments?: number }
      if (data.cardSurchargePercent != null) setCardSurchargePercent(String(data.cardSurchargePercent))
      if (data.cardMaxInstallments != null) setCardMaxInstallments(String(data.cardMaxInstallments))
    } catch { /* ignore */ } finally {
      setStoreSettingsLoading(false)
    }
  }

  async function saveStoreSettings() {
    const surcharge = Number(cardSurchargePercent)
    const installments = Number(cardMaxInstallments)
    if (!Number.isFinite(surcharge) || surcharge < 0 || surcharge > 100) {
      toast.error("Percentual de acréscimo deve estar entre 0 e 100.")
      return
    }
    if (!Number.isInteger(installments) || installments < 1 || installments > 6) {
      toast.error("Parcelas máximas deve ser um número inteiro entre 1 e 6.")
      return
    }
    try {
      setStoreSettingsSaving(true)
      const res = await fetch("/api/admin/store-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardSurchargePercent: surcharge, cardMaxInstallments: installments }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? "")
      toast.success("Configurações da Loja salvas.")
    } catch (err) {
      toast.error("Falha ao salvar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setStoreSettingsSaving(false)
    }
  }

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
      const msg = data.warning ?? t.settings.youTubeSnapshotRefreshed
      setSuccess(msg)
      toast.success(t.settings.youTubeSynced, { description: msg })
    } catch (err) {
      const message = err instanceof Error ? err.message : t.settings.failedToRefresh
      setError(message)
      toast.error(t.settings.failedToRefreshYoutube, { description: message })
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
      const message = err instanceof Error ? err.message : t.settings.failedToLoadProfileMsg
      setError(message)
      toast.error(t.settings.failedToLoadProfile, { description: message })
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
      toast.success(t.settings.avatarUploaded)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.settings.failedToUploadAvatar
      setError(message)
      toast.error(t.settings.failedToUploadAvatar, { description: message })
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
      const msg = t.settings.profileSavedDesc
      setSuccess(msg)
      toast.success(t.settings.profileSaved)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.settings.failedToSave
      setError(message)
      toast.error(t.settings.failedToSave, { description: message })
    } finally {
      setSaving(false)
    }
  }

  async function updatePassword() {
    setPasswordError(null)
    setPasswordSuccess(false)
    if (newPassword.length < 8) {
      const msg = t.settings.passwordMin8
      setPasswordError(msg)
      toast.error(msg)
      return
    }
    if (newPassword !== confirmPassword) {
      const msg = t.settings.passwordsDoNotMatch
      setPasswordError(msg)
      toast.error(msg)
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
      toast.success(t.settings.passwordUpdated)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.settings.failedToChangePassword
      setPasswordError(message)
      toast.error(t.settings.failedToChangePassword, { description: message })
    }
  }

  const previewName = useMemo(() => displayName.trim() || getNameFallback(email), [displayName, email])
  const roleLabel = adminRoleLabel(t, role)

  usePageHeader(t.settings.title, t.settings.subtitle)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Global messages */}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>}

      {/* ── Profile card ── */}
      <Card className="border-border bg-card/90 overflow-hidden">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-primary" />
            {t.settings.adminProfile}
          </CardTitle>
          <CardDescription>
            {t.settings.adminProfileDesc}
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
                {t.settings.thisNameOnArticles}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Email (readonly) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.settings.accountEmail}</label>
              <Input value={email ?? "-"} readOnly className="border-border bg-muted/20 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground/60">{t.settings.cannotChange}</p>
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.settings.displayName}</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="border-border bg-background"
                placeholder={t.settings.displayNamePlaceholder}
                maxLength={80}
              />
              <p className="text-[10px] text-muted-foreground">
                {t.settings.preview}<span className="text-foreground font-medium">{previewName}</span>
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={saveProfile} disabled={saving || uploading} className="gap-2 min-w-32">
              {saving ? t.settings.saving : t.settings.saveProfile}
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
              {t.settings.changePassword}
            </CardTitle>
            <CardDescription className="text-amber-200/60">
              {t.settings.exclusiveToWebmaster}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {passwordError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{passwordError}</div>
            )}
            {passwordSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                {t.settings.passwordUpdatedSuccess}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.settings.newPassword}</label>
                <Input
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false) }}
                  className="border-amber-500/20 bg-background"
                  placeholder={t.settings.minChars}
                  type="password"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.settings.confirmPassword}</label>
                <Input
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSuccess(false) }}
                  className={`border-amber-500/20 bg-background ${confirmPassword && confirmPassword !== newPassword ? "border-red-500/50" : ""}`}
                  placeholder={t.settings.repeatPassword}
                  type="password"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[10px] text-red-400">{t.settings.passwordsDoNotMatch}</p>
                )}
              </div>
            </div>
            <PasswordStrengthMeter password={newPassword} />

            <div className="flex justify-end border-t border-amber-500/20 pt-4">
              <Button
                onClick={updatePassword}
                disabled={!newPassword || newPassword !== confirmPassword}
                className="gap-2 bg-amber-500 text-black hover:bg-amber-400 min-w-32"
              >
                <KeyRound className="size-4" />
                {t.settings.updatePassword}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Store payment settings card (webmaster only) ── */}
      {role === "webmaster" && (
        <Card className="border-border bg-card/90">
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4 text-primary" />
              Pagamento da Loja
            </CardTitle>
            <CardDescription>
              Acréscimo cobrado no cartão de crédito (via Asaas Checkout) sobre o preço no PIX, e o teto de
              parcelas oferecido ao cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            {storeSettingsLoading ? (
              <div className="flex justify-center py-4">
                <BoxLoader />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Acréscimo do cartão (%)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={cardSurchargePercent}
                      onChange={(e) => setCardSurchargePercent(e.target.value)}
                      className="border-border bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Parcelas máximas
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      step="1"
                      value={cardMaxInstallments}
                      onChange={(e) => setCardMaxInstallments(e.target.value)}
                      className="border-border bg-background"
                    />
                  </div>
                </div>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button onClick={saveStoreSettings} disabled={storeSettingsSaving} className="gap-2 min-w-32">
                    {storeSettingsSaving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── YouTube sync card ── */}
      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Youtube className="size-4 text-red-400" />
            {t.settings.youtubeSync}
          </CardTitle>
          <CardDescription>
            {t.settings.youtubeSyncDesc}
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
                    ? t.settings.available
                    : t.settings.notAvailable}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Clock className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t.settings.lastSync}</p>
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
                  {videoStatus?.stale ? t.settings.outdated : t.settings.upToDate}
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
              {videoStatusLoading ? t.settings.refreshing : t.settings.reloadStatus}
            </Button>
            <Button onClick={refreshVideoSnapshot} disabled={videoRefreshing || videoStatusLoading} size="sm" className="gap-2">
              <RefreshCw className={`size-4 ${videoRefreshing ? "animate-spin" : ""}`} />
              {videoRefreshing ? t.settings.syncing : t.settings.forceRefresh}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
