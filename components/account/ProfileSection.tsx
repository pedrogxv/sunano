"use client"

import { useEffect, useState } from "react"
import type { ChangeEvent } from "react"
import { Camera, ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { FavoritosEditor, MedalhasEditor, SetupEditor } from "./showcase-editors"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import BoxLoader from "@/components/ui/box-loader"
import { useAccountTier } from "@/lib/hooks/use-account-tier"
import {
  DISPLAY_NAME_MAX_LENGTH,
  slugifyDisplayName,
  validateDisplayName,
} from "@/lib/profile-name"
import {
  BIO_MAX_LENGTH,
  type ProfileShowcase,
  type SetupItem,
  type SetupSlot,
  type ShowcaseMedal,
  type ShowcasePeripheral,
} from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

export type ProfileData = {
  id?: string
  email: string | null
  display_name: string
  /** Derivado do nome pelo banco — é o endereço público do perfil. */
  display_slug?: string | null
  avatar_url: string | null
  theme: string | null
  locale: string | null
  lgpd_consent_at?: string | null
  lgpd_consent_version?: string | null
  banner_url?: string | null
  bio?: string | null
  account_tier?: string | null
}

interface ProfileSectionProps {
  profile: ProfileData
  onProfileChange: (profile: ProfileData) => void
}

/**
 * Perfil e vitrine em uma seção só: identidade (banner, avatar, nome, bio) e o
 * que aparece no perfil público (setup, favoritos, medalhas). Os dois grupos
 * batem em endpoints diferentes, mas são salvos pelo mesmo botão.
 */
export function ProfileSection({ profile, onProfileChange }: ProfileSectionProps) {
  const { favoriteLimit, medalLimit, capabilities, animatedMedia } = useAccountTier(
    profile.account_tier
  )

  // ── Identidade ──
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url)
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile.banner_url ?? null)
  const [bio, setBio] = useState(profile.bio ?? "")
  const [uploading, setUploading] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

  // ── Vitrine ──
  const [loadingShowcase, setLoadingShowcase] = useState(true)
  const [setup, setSetup] = useState<SetupItem[]>([])
  const [favorites, setFavorites] = useState<ShowcasePeripheral[]>([])
  const [allMedals, setAllMedals] = useState<ShowcaseMedal[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  const [saving, setSaving] = useState(false)

  // Estado do nome: o conflito precisa aparecer enquanto a pessoa digita, não
  // só quando ela tenta salvar.
  const [nameCheck, setNameCheck] = useState<{
    state: "idle" | "checking" | "free" | "taken"
    message: string | null
  }>({ state: "idle", message: null })

  const previewName = displayName.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const slugPreview = slugifyDisplayName(displayName) || profile.display_slug || "seu-nome"
  const nameChanged = displayName.trim() !== (profile.display_name ?? "").trim()
  // GIF só entra no seletor de arquivos de quem pode usá-lo; a API valida de novo.
  const imageAccept = animatedMedia
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "image/jpeg,image/png,image/webp"

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [showcaseRes, medalsRes] = await Promise.all([
          fetch("/api/profile/showcase", { cache: "no-store" }),
          fetch("/api/profile/medals", { cache: "no-store" }),
        ])
        const showcaseData = (await showcaseRes.json().catch(() => null)) as
          | { showcase?: ProfileShowcase }
          | null
        const medalsData = (await medalsRes.json().catch(() => null)) as
          | { medals?: ShowcaseMedal[] }
          | null

        if (!mounted) return

        if (showcaseData?.showcase) {
          setSetup(showcaseData.showcase.setup)
          setFavorites(showcaseData.showcase.favorites)
        }

        const medals = medalsData?.medals ?? []
        setAllMedals(medals)
        setPinnedIds(
          medals
            .filter((m) => m.pinned)
            .sort((a, b) => (a.pinned_order ?? 0) - (b.pinned_order ?? 0))
            .map((m) => m.id)
        )
      } finally {
        if (mounted) setLoadingShowcase(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!nameChanged) {
      setNameCheck({ state: "idle", message: null })
      return
    }

    const invalid = validateDisplayName(displayName)
    if (invalid) {
      setNameCheck({ state: "taken", message: invalid })
      return
    }

    setNameCheck({ state: "checking", message: null })
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/name-check?name=${encodeURIComponent(displayName.trim())}`
        )
        const data = (await res.json().catch(() => null)) as
          | { available?: boolean; error?: string | null }
          | null
        if (cancelled) return
        setNameCheck(
          data?.available
            ? { state: "free", message: null }
            : { state: "taken", message: data?.error ?? "Esse nome já está em uso." }
        )
      } catch {
        // Sem rede a UI não afirma nada; o índice único do banco ainda barra.
        if (!cancelled) setNameCheck({ state: "idle", message: null })
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [displayName, nameChanged])

  function updateSlot(slot: SetupSlot, peripheral: ShowcasePeripheral | null) {
    setSetup((prev) => prev.map((item) => (item.slot === slot ? { ...item, peripheral } : item)))
  }

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

  /** Retorna a mensagem de erro, ou `null` em caso de sucesso. */
  async function persistIdentity(): Promise<string | null> {
    try {
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
      const data = (await res.json().catch(() => null)) as
        | { error?: string; profile?: ProfileData }
        | null
      if (!res.ok || !data?.profile) return data?.error || "Erro ao salvar perfil"

      setDisplayName(data.profile.display_name)
      setAvatarUrl(data.profile.avatar_url)
      setAvatarPreview(data.profile.avatar_url)
      setBannerUrl(data.profile.banner_url ?? null)
      setBio(data.profile.bio ?? "")
      onProfileChange(data.profile)
      return null
    } catch {
      return "Erro ao salvar perfil"
    }
  }

  /** Retorna a mensagem de erro, ou `null` em caso de sucesso. */
  async function persistShowcase(): Promise<string | null> {
    try {
      const res = await fetch("/api/profile/showcase", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setup: setup.map((item) => ({
            slot: item.slot,
            peripheral_id: item.peripheral?.id ?? null,
          })),
          favorites: favorites.map((f) => f.id),
          pinned_medals: pinnedIds,
        }),
      })
      const data = (await res.json().catch(() => null)) as
        | { error?: string; showcase?: ProfileShowcase }
        | null
      if (!res.ok || !data?.showcase) return data?.error || "Erro ao salvar vitrine"

      setSetup(data.showcase.setup)
      setFavorites(data.showcase.favorites)
      return null
    } catch {
      return "Erro ao salvar vitrine"
    }
  }

  async function save() {
    try {
      setSaving(true)
      const [identityError, showcaseError] = await Promise.all([
        persistIdentity(),
        persistShowcase(),
      ])
      const failure = identityError ?? showcaseError
      if (failure) {
        toast.error("Não foi possível salvar tudo", { description: failure })
        return
      }
      toast.success("Perfil salvo")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Identidade ── */}
      <section className="space-y-4">
        <SectionHeading
          title="Identidade"
          description="Nome, foto e bio — é assim que você aparece no fórum e no perfil público."
        />

        <Card className="border-border bg-card/90 overflow-hidden">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Banner do perfil
              </label>
              <label
                className="relative flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/20 transition-colors hover:border-primary/40 sm:h-36"
                style={
                  bannerUrl
                    ? {
                        backgroundImage: `url(${bannerUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
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
                {animatedMedia
                  ? "JPG, PNG, WEBP ou GIF animado até 5MB."
                  : "JPG, PNG ou WEBP até 5MB. GIF animado é exclusivo para membros VIP."}
              </p>
            </div>

            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <div className="relative shrink-0">
                <Avatar className="size-24 border-2 border-border shadow-lg">
                  <AvatarImage src={avatarPreview ?? undefined} alt={previewName} />
                  <AvatarFallback className="text-2xl font-bold">
                    {previewName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email da conta
                </label>
                <Input
                  value={profile.email ?? "-"}
                  readOnly
                  className="border-border bg-muted/20 text-muted-foreground"
                />
                <p className="text-[10px] text-muted-foreground/60">Não pode ser alterado.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome de exibição
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={cn(
                    "border-border bg-background",
                    nameCheck.state === "taken" && "border-red-500/50"
                  )}
                  placeholder="ex: Pedro"
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  aria-invalid={nameCheck.state === "taken"}
                />
                <p className="truncate text-[10px] text-muted-foreground/60">
                  sunano.com.br/perfil/<span className="text-muted-foreground">{slugPreview}</span>
                </p>
                {nameCheck.state === "checking" && (
                  <p className="text-[10px] text-muted-foreground/60">Verificando disponibilidade…</p>
                )}
                {nameCheck.state === "free" && (
                  <p className="text-[10px] text-emerald-400">Nome disponível.</p>
                )}
                {nameCheck.state === "taken" && nameCheck.message && (
                  <p className="text-[10px] text-red-400">{nameCheck.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bio
                </label>
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
          </CardContent>
        </Card>
      </section>

      {/* ── Vitrine ── */}
      <section className="space-y-4">
        <SectionHeading
          title="Vitrine"
          description="Setup, favoritos e medalhas em destaque no seu perfil público."
        />

        {loadingShowcase ? (
          <div className="flex min-h-64 items-center justify-center">
            <BoxLoader />
          </div>
        ) : (
          <div className="space-y-4">
            <SetupEditor setup={setup} onChange={updateSlot} />
            <FavoritosEditor
              favorites={favorites}
              limit={favoriteLimit}
              tierLabel={capabilities.label}
              onChange={setFavorites}
            />
            <MedalhasEditor
              medals={allMedals}
              pinnedIds={pinnedIds}
              limit={medalLimit}
              onChange={setPinnedIds}
            />
          </div>
        )}
      </section>

      {/* Barra de salvamento — identidade e vitrine vão juntas. */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <p className="text-xs text-muted-foreground">
          Identidade e vitrine são salvas de uma vez só.
        </p>
        <Button
          onClick={save}
          disabled={
            saving ||
            uploading ||
            uploadingBanner ||
            loadingShowcase ||
            nameCheck.state === "taken" ||
            nameCheck.state === "checking"
          }
          className="min-w-40"
        >
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
