"use client"

import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent } from "react"
import { Upload } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useLocale } from "@/lib/locale-context"

type AdminProfile = {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  role: "admin" | "moderator" | "webmaster"
  permissions: Record<string, boolean>
}

type AdminUser = AdminProfile & {
  created_at: string
  updated_at: string
}

function getNameFallback(email: string | null | undefined) {
  if (!email) return "Admin"
  const [localPart] = email.split("@")
  return localPart || "Admin"
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
  }, [])

  async function loadVideoSnapshotStatus() {
    try {
      setVideoStatusLoading(true)

      const response = await fetch("/api/admin/videos/refresh", { method: "GET" })
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string
            status?: {
              hasSnapshot: boolean
              fetchedAt: string | null
              stale: boolean
              lastError: string | null
            }
          }
        | null

      if (!response.ok || !data?.status) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load video sync status" : "Erro ao carregar status de vídeos"))
      }

      setVideoStatus(data.status)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load video sync status" : "Erro ao carregar status de vídeos"))
    } finally {
      setVideoStatusLoading(false)
    }
  }

  async function refreshVideoSnapshot() {
    try {
      setVideoRefreshing(true)
      setError(null)
      setSuccess(null)

      const response = await fetch("/api/admin/videos/refresh", { method: "POST" })
      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            warning?: string | null
            status?: {
              hasSnapshot: boolean
              fetchedAt: string | null
              stale: boolean
              lastError: string | null
            }
          }
        | null

      if (!response.ok || !data?.status) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to refresh YouTube snapshot" : "Erro ao atualizar snapshot do YouTube"))
      }

      setVideoStatus(data.status)
      setSuccess(
        data.warning
          ? data.warning
          : (isEnglish ? "YouTube snapshot refreshed successfully." : "Snapshot do YouTube atualizado com sucesso.")
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to refresh YouTube snapshot" : "Erro ao atualizar snapshot do YouTube"))
    } finally {
      setVideoRefreshing(false)
    }
  }

  async function loadProfile() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/admin/profile", { method: "GET" })
      const data = (await response.json().catch(() => null)) as
        | { error?: string; profile?: AdminProfile }
        | null

      if (!response.ok || !data?.profile) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load profile" : "Erro ao carregar perfil"))
      }

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
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)

      const uploadBody = new FormData()
      uploadBody.append("file", file)

      const uploadResponse = await fetch("/api/admin/profile/upload-avatar", {
        method: "POST",
        body: uploadBody,
      })

      const uploadData = (await uploadResponse.json().catch(() => null)) as
        | { error?: string; publicUrl?: string }
        | null

      if (!uploadResponse.ok || !uploadData?.publicUrl) {
        throw new Error(uploadData?.error ?? (isEnglish ? "Failed to upload avatar" : "Erro ao enviar avatar"))
      }

      setAvatarUrl(uploadData.publicUrl)
      setAvatarPreview(uploadData.publicUrl)
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

      const response = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          avatar_url: avatarUrl,
        }),
      })

      const data = (await response.json().catch(() => null)) as
        | { error?: string; profile?: AdminProfile }
        | null

      if (!response.ok || !data?.profile) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to save profile" : "Erro ao salvar perfil"))
      }

      setDisplayName(data.profile.display_name)
      setEmail(data.profile.email)
      setAvatarUrl(data.profile.avatar_url)
      setAvatarPreview(data.profile.avatar_url)
      setRole(data.profile.role)
      setSuccess(isEnglish ? "Profile updated successfully." : "Perfil atualizado com sucesso.")
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save profile" : "Erro ao salvar perfil"))
    } finally {
      setSaving(false)
    }
  }

  async function updatePassword() {
    try {
      setError(null)
      setSuccess(null)

      if (newPassword.length < 8) {
        setError(isEnglish ? "Password must be at least 8 characters." : "A senha deve ter no mínimo 8 caracteres.")
        return
      }

      if (newPassword !== confirmPassword) {
        setError(isEnglish ? "Passwords do not match." : "As senhas não conferem.")
        return
      }

      const response = await fetch("/api/admin/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })

      const data = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to change password" : "Erro ao alterar senha"))
      }

      setNewPassword("")
      setConfirmPassword("")
      setSuccess(isEnglish ? "Password updated successfully." : "Senha atualizada com sucesso.")
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to change password" : "Erro ao alterar senha"))
    }
  }

  const previewName = useMemo(() => {
    return displayName.trim() || getNameFallback(email)
  }, [displayName, email])

  if (loading) {
    return <div className="text-sm text-slate-400">{isEnglish ? "Loading settings..." : "Carregando configurações..."}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-50">{isEnglish ? "Settings" : "Configurações"}</h1>
        <p className="mt-1 text-sm text-slate-400">{isEnglish ? "Set your name and profile photo used as blog review authorship." : "Defina seu nome e foto usados como autoria dos reviews no blog."}</p>
      </div>

      <Card className="border-white/10 bg-[#131a28]/90">
        <CardHeader className="border-b border-white/10">
          <CardTitle>{isEnglish ? "Admin profile" : "Perfil do Admin"}</CardTitle>
          <CardDescription>
            {isEnglish ? "If the name is empty, the system automatically uses the first part of your email." : "Se o nome ficar vazio, o sistema usa automaticamente a parte inicial do seu email."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {error ? (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
          ) : null}

          {success ? (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>
          ) : null}

          <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20 border border-white/10">
              <AvatarImage src={avatarPreview ?? undefined} alt={previewName} />
              <AvatarFallback>{previewName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="space-y-2">
              <label className="block rounded-lg border-2 border-dashed border-white/20 p-4 cursor-pointer hover:border-white/40 transition">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Upload className="size-4 text-slate-400" />
                  {uploading ? (isEnglish ? "Uploading avatar..." : "Enviando avatar...") : (isEnglish ? "Upload profile photo" : "Enviar foto de perfil")}
                </div>
              </label>
              <p className="text-xs text-slate-500">{isEnglish ? "Accepted formats: JPG, PNG or WEBP. Max size: 3MB." : "Formatos aceitos: JPG, PNG ou WEBP. Tamanho máximo: 3MB."}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-100">{isEnglish ? "Account email" : "Email da conta"}</label>
            <Input value={email ?? "-"} readOnly className="border-white/10 bg-white/5 text-slate-300" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-100">{isEnglish ? "Display name on blog" : "Nome de exibição no blog"}</label>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="border-white/10 bg-white/5"
              placeholder={isEnglish ? "Ex: John" : "Ex: Pedro"}
              maxLength={80}
            />
            <p className="text-xs text-slate-500">
              {isEnglish ? "Author preview" : "Prévia da autoria"}: <span className="text-slate-300">{previewName}</span>
            </p>
          </div>

          {role === "webmaster" ? (
            <div className="space-y-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-amber-100">{isEnglish ? "Change password" : "Alterar senha"}</h3>
                <p className="text-xs text-amber-200/80">
                  {isEnglish ? "This area is exclusive to WEB Master." : "Esta área é exclusiva para o WEB Master."}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-100">{isEnglish ? "New password" : "Nova senha"}</label>
                  <Input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="border-white/10 bg-white/5"
                    placeholder={isEnglish ? "Enter the new password" : "Digite a nova senha"}
                    type="password"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-100">{isEnglish ? "Confirm password" : "Confirmar senha"}</label>
                  <Input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="border-white/10 bg-white/5"
                    placeholder={isEnglish ? "Repeat the new password" : "Repita a nova senha"}
                    type="password"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={updatePassword}>{isEnglish ? "Save new password" : "Salvar nova senha"}</Button>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={saving || uploading}>
              {saving ? (isEnglish ? "Saving..." : "Salvando...") : (isEnglish ? "Save profile" : "Salvar perfil")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-[#131a28]/90">
        <CardHeader className="border-b border-white/10">
          <CardTitle>{isEnglish ? "YouTube sync cache" : "Cache de sincronização do YouTube"}</CardTitle>
          <CardDescription>
            {isEnglish
              ? "Stores one daily snapshot used on the public videos page and allows manual refresh."
              : "Armazena um snapshot diário usado na página pública de vídeos e permite atualização manual."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{isEnglish ? "Snapshot" : "Snapshot"}</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {videoStatusLoading
                  ? (isEnglish ? "Loading..." : "Carregando...")
                  : videoStatus?.hasSnapshot
                    ? (isEnglish ? "Available" : "Disponível")
                    : (isEnglish ? "Not available" : "Indisponível")}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{isEnglish ? "Last sync" : "Última sincronização"}</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {videoStatus?.fetchedAt
                  ? new Date(videoStatus.fetchedAt).toLocaleString("pt-BR")
                  : "-"}
              </p>
            </div>
          </div>

          {videoStatus?.lastError ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {isEnglish ? "Last sync warning" : "Último aviso de sincronização"}: {videoStatus.lastError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={loadVideoSnapshotStatus} disabled={videoStatusLoading || videoRefreshing}>
              {videoStatusLoading
                ? (isEnglish ? "Refreshing status..." : "Atualizando status...")
                : (isEnglish ? "Reload status" : "Recarregar status")}
            </Button>
            <Button onClick={refreshVideoSnapshot} disabled={videoRefreshing || videoStatusLoading}>
              {videoRefreshing
                ? (isEnglish ? "Refreshing snapshot..." : "Atualizando snapshot...")
                : (isEnglish ? "Force refresh now" : "Forçar atualização agora")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

