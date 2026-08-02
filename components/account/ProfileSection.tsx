"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import type { ChangeEvent } from "react"
import { Camera, Crown, Sparkles, Youtube } from "lucide-react"
import { toast } from "sonner"

import { FavoritosEditor, MedalhasEditor, SetupEditor } from "./showcase-editors"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { TikTokIcon } from "@/components/icons/social-icons"
import { resolveProfileMedia, type ProfileMedia } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
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
  normalizeSocialHandle,
  type ProfileShowcase,
  type SetupItem,
  type SetupSlot,
  type ShowcaseMedal,
  type ShowcasePeripheral,
} from "@/lib/profile-showcase"
import { profileAccentHue } from "@/lib/user-directory"
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
  mini_banner_url?: string | null
  bio?: string | null
  account_tier?: string | null
  youtube_handle?: string | null
  tiktok_handle?: string | null
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
  const { tier, favoriteLimit, medalLimit, capabilities, animatedMedia, isVip } = useAccountTier(
    profile.account_tier
  )

  // ── Identidade ──
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url)
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile.banner_url ?? null)
  const [miniBannerUrl, setMiniBannerUrl] = useState<string | null>(
    profile.mini_banner_url ?? null
  )
  const [bio, setBio] = useState(profile.bio ?? "")
  const [youtubeHandle, setYoutubeHandle] = useState(profile.youtube_handle ?? "")
  const [tiktokHandle, setTiktokHandle] = useState(profile.tiktok_handle ?? "")
  const [uploading, setUploading] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingMiniBanner, setUploadingMiniBanner] = useState(false)

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
  const specialTag = getSpecialTag(profile.display_slug)
  const slugPreview = slugifyDisplayName(displayName) || profile.display_slug || "seu-nome"
  const nameChanged = displayName.trim() !== (profile.display_name ?? "").trim()
  // GIF só entra no seletor de arquivos de quem pode usá-lo; a API valida de novo.
  const imageAccept = animatedMedia
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "image/jpeg,image/png,image/webp"
  // O preview passa pelas mesmas regras de tier do perfil público: um GIF de
  // conta comum aparece parado aqui, exatamente como vai aparecer lá.
  const bannerPreview = resolveProfileMedia(bannerUrl, tier)
  const miniBannerPreview = resolveProfileMedia(miniBannerUrl, tier)
  // Mesma cor de fallback que o card de /pessoas usa quando falta mini banner.
  const accentHue = profile.id ? profileAccentHue(profile.id) : 210

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

  async function handleMiniBannerSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setUploadingMiniBanner(true)
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/profile/upload-banner", { method: "POST", body })
      const data = (await res.json().catch(() => null)) as { error?: string; publicUrl?: string } | null
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "")
      setMiniBannerUrl(data.publicUrl)
      toast.success("Mini banner enviado")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao enviar mini banner"
      toast.error("Erro ao enviar mini banner", { description: message })
    } finally {
      setUploadingMiniBanner(false)
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
          mini_banner_url: miniBannerUrl,
          bio,
          youtube_handle: youtubeHandle,
          tiktok_handle: tiktokHandle,
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
      setMiniBannerUrl(data.profile.mini_banner_url ?? null)
      setBio(data.profile.bio ?? "")
      setYoutubeHandle(data.profile.youtube_handle ?? "")
      setTiktokHandle(data.profile.tiktok_handle ?? "")
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
        <Card className="border-border bg-card/90 overflow-hidden">
          <CardContent className="space-y-6 pt-6">
            {/* Banner: preview da página de perfil inteira — a capa aparece no
                contexto real, com a foto e o mini banner sobrepostos. */}
            <div className="space-y-2">
              <PreviewLabel
                label="Banner do perfil"
                hint="Aparece no topo do seu perfil público."
              />

              <ProfilePagePreview
                banner={bannerPreview}
                miniBanner={miniBannerPreview}
                avatarSrc={avatarPreview}
                name={previewName}
                tierLabel={capabilities.label}
                isVip={isVip}
                specialTag={specialTag}
                imageAccept={imageAccept}
                uploadingAvatar={uploading}
                onAvatarChange={handleAvatarSelect}
                uploadingBanner={uploadingBanner}
                onBannerChange={handleBannerSelect}
              />
            </div>

            {/* Mini banner: preview no formato de card do próprio site — é
                onde a faixa aparece atrás da foto, em /pessoas. */}
            <div className="space-y-2">
              <PreviewLabel label="Foto de Perfil" />

              <MiniBannerCardPreview
                miniBanner={miniBannerPreview}
                avatarSrc={avatarPreview}
                name={previewName}
                isVip={isVip}
                specialTag={specialTag}
                accentHue={accentHue}
                imageAccept={imageAccept}
                uploadingAvatar={uploading}
                onAvatarChange={handleAvatarSelect}
                uploadingMiniBanner={uploadingMiniBanner}
                onMiniBannerChange={handleMiniBannerSelect}
              />
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Youtube className="size-3.5" />
                  YouTube
                </label>
                <Input
                  value={youtubeHandle}
                  onChange={(e) => setYoutubeHandle(normalizeSocialHandle(e.target.value))}
                  className="border-border bg-background"
                  placeholder="@seucanal"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <TikTokIcon className="size-3.5" />
                  TikTok
                </label>
                <Input
                  value={tiktokHandle}
                  onChange={(e) => setTiktokHandle(normalizeSocialHandle(e.target.value))}
                  className="border-border bg-background"
                  placeholder="@seuusuario"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Vitrine ── */}
      <section className="space-y-4">
        <SectionHeading
          title="Meu Espaço"
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
            uploadingMiniBanner ||
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

function PreviewLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

/**
 * Miniatura da página de perfil: capa, foto sobreposta (com o mini banner
 * atrás) e o resto do perfil em cinza. Espelha `components/profile/
 * ProfileShowcase` — mexer lá pede ajustar aqui, senão o preview mente.
 */
function ProfilePagePreview({
  banner,
  miniBanner,
  avatarSrc,
  name,
  tierLabel,
  isVip,
  specialTag,
  imageAccept,
  uploadingAvatar,
  onAvatarChange,
  uploadingBanner,
  onBannerChange,
}: {
  banner: ProfileMedia
  miniBanner: ProfileMedia
  avatarSrc: string | null
  name: string
  tierLabel: string
  isVip: boolean
  specialTag: ReturnType<typeof getSpecialTag>
  imageAccept: string
  uploadingAvatar: boolean
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void
  uploadingBanner: boolean
  onBannerChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "relative h-28 w-full overflow-hidden sm:h-36",
          !banner.src && "bg-gradient-to-br from-primary/20 via-muted/40 to-background"
        )}
      >
        {banner.src && (
          <Image
            src={banner.src}
            alt=""
            fill
            unoptimized={banner.animated}
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card/70 to-transparent" />
        <label
          className={cn(
            "absolute bottom-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-md transition-colors",
            uploadingBanner ? "animate-pulse bg-muted" : "bg-primary hover:bg-primary/90"
          )}
          title="Trocar banner"
        >
          <input
            type="file"
            accept={imageAccept}
            className="hidden"
            onChange={onBannerChange}
            disabled={uploadingBanner}
          />
          <Camera className="size-3.5 text-primary-foreground" />
        </label>
      </div>

      <div className="flex flex-col items-center px-4 pb-4">
        <div className="relative -mt-10 sm:-mt-12">
          {miniBanner.src && (
            <div className="absolute inset-x-[-2.5rem] top-1/2 h-14 -translate-y-1/2 overflow-hidden rounded-xl opacity-70">
              <Image
                src={miniBanner.src}
                alt=""
                fill
                unoptimized={miniBanner.animated}
                sizes="320px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-card via-transparent to-card" />
            </div>
          )}

          <div className="relative">
            <Avatar className="size-20 border-4 border-background shadow-xl sm:size-24">
              <AvatarImage src={avatarSrc ?? undefined} alt={name} />
              <AvatarFallback className="text-2xl font-bold">
                {name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label
              className={cn(
                "absolute -bottom-1 -right-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-md transition-colors",
                uploadingAvatar ? "animate-pulse bg-muted" : "bg-primary hover:bg-primary/90"
              )}
              title="Trocar foto de perfil"
            >
              <input
                type="file"
                accept={imageAccept}
                className="hidden"
                onChange={onAvatarChange}
                disabled={uploadingAvatar}
              />
              <Camera className="size-3.5 text-primary-foreground" />
            </label>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <p className="text-base font-bold text-foreground">{name}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              isVip
                ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                : "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            {isVip && <Crown className="size-2.5" />}
            {tierLabel}
          </span>
          {specialTag && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                specialTag.className
              )}
            >
              <Sparkles className="size-2.5" />
              {specialTag.label}
            </span>
          )}
        </div>

        {/* Setup, medalhas e favoritos entram em cinza: aqui eles só situam a
            capa — quem edita esses blocos é a seção Vitrine, mais abaixo. */}
        <div className="mt-4 w-full space-y-3 opacity-40" aria-hidden>
          <PreviewSkeletonRow columns={5} />
          <PreviewSkeletonRow columns={4} />
        </div>
      </div>
    </div>
  )
}

function PreviewSkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 w-14 rounded-full bg-muted-foreground/30" />
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="h-9 rounded-lg border border-border bg-muted/30" />
        ))}
      </div>
    </div>
  )
}

/**
 * Réplica estática do card de `/pessoas` (`components/people/ProfileCard`),
 * sem link nem botão de seguir: é onde o mini banner aparece de verdade.
 */
function MiniBannerCardPreview({
  miniBanner,
  avatarSrc,
  name,
  isVip,
  specialTag,
  accentHue,
  imageAccept,
  uploadingAvatar,
  onAvatarChange,
  uploadingMiniBanner,
  onMiniBannerChange,
}: {
  miniBanner: ProfileMedia
  avatarSrc: string | null
  name: string
  isVip: boolean
  specialTag: ReturnType<typeof getSpecialTag>
  accentHue: number
  imageAccept: string
  uploadingAvatar: boolean
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void
  uploadingMiniBanner: boolean
  onMiniBannerChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex justify-center rounded-xl border border-border bg-muted/10 p-4">
      <div className="w-52 overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className="relative h-20 w-full overflow-hidden"
          style={
            miniBanner.src
              ? undefined
              : {
                  backgroundImage: `linear-gradient(135deg, hsl(${accentHue} 65% 45% / 0.85), hsl(${(accentHue + 45) % 360} 60% 30% / 0.55))`,
                }
          }
        >
          {miniBanner.src && (
            <Image
              src={miniBanner.src}
              alt=""
              fill
              unoptimized={miniBanner.animated}
              sizes="240px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          <label
            className={cn(
              "absolute bottom-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-md transition-colors",
              uploadingMiniBanner ? "animate-pulse bg-muted" : "bg-primary hover:bg-primary/90"
            )}
            title="Trocar mini banner"
          >
            <input
              type="file"
              accept={imageAccept}
              className="hidden"
              onChange={onMiniBannerChange}
              disabled={uploadingMiniBanner}
            />
            <Camera className="size-3 text-primary-foreground" />
          </label>
        </div>

        <div className="-mt-11 flex flex-col items-center px-3 pb-3">
          <div className="relative">
            <Avatar
              className={cn("size-[86px] ring-4", isVip ? "ring-amber-400/70" : "ring-background")}
            >
              <AvatarImage src={avatarSrc ?? undefined} alt={name} />
              <AvatarFallback className="text-xl font-bold">
                {name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label
              className={cn(
                "absolute -bottom-1 -right-1 flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-md transition-colors",
                uploadingAvatar ? "animate-pulse bg-muted" : "bg-primary hover:bg-primary/90"
              )}
              title="Trocar foto de perfil"
            >
              <input
                type="file"
                accept={imageAccept}
                className="hidden"
                onChange={onAvatarChange}
                disabled={uploadingAvatar}
              />
              <Camera className="size-3 text-primary-foreground" />
            </label>
          </div>

          <p className="mt-2.5 flex w-full items-center justify-center gap-1 text-[15px] font-bold leading-tight text-foreground">
            <span className="truncate">{name}</span>
            {isVip && <Crown className="size-3.5 shrink-0 text-amber-400" />}
            {specialTag && <Sparkles className="size-3.5 shrink-0 text-cyan-400" />}
          </p>

          {/* Visitas e botão de seguir viram cinza: no editor eles não têm
              número real nem ação — o que importa é a faixa. */}
          <div className="mt-2 h-1.5 w-16 rounded-full bg-muted-foreground/25" aria-hidden />
          <div className="mt-3 h-7 w-full rounded-lg border border-border bg-muted/20" aria-hidden />
        </div>
      </div>
    </div>
  )
}
