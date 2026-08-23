"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import type { ChangeEvent } from "react"
import { Camera, Crown, Pencil, Sparkles, Youtube } from "lucide-react"
import { toast } from "sonner"

import { FavoritosEditor, MedalhasEditor, SetupEditor } from "./showcase-editors"
import { MediaAdjuster } from "./MediaAdjuster"
import { compressImageFile } from "@/lib/client/compress-image"
import { supabaseStorageClient } from "@/lib/client/supabase-storage"
import {
  coerceMediaAdjustments,
  DEFAULT_ADJUST,
  mediaAdjustStyle,
  type AdjustableMedia,
  type MediaAdjust,
  type ProfileMediaAdjustments,
} from "@/lib/profile-media-adjust"
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
import { slugifyDisplayName } from "@/lib/profile-name"
import { ChangeDisplayNameModal } from "@/components/profile/ChangeDisplayNameModal"
import {
  BIO_MAX_LENGTH,
  normalizeSocialHandle,
  type ProfileShowcase,
  type SetupItem,
  type SetupSlot,
  type ShowcaseMedal,
  type ShowcasePeripheral,
} from "@/lib/profile-showcase"
import { CARD_SURFACE } from "@/lib/ui-styles"
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
  vip_expires_at?: string | null
  youtube_handle?: string | null
  tiktok_handle?: string | null
  media_adjustments?: unknown
}

interface ProfileSectionProps {
  profile: ProfileData
  onProfileChange: (profile: ProfileData) => void
}

// Vale para banner e fundo do Mini Perfil: o upload vai direto pro Storage
// (não passa mais pelo limite de corpo da Vercel), mas ainda vale comprimir
// fotos de câmera gigantes pra deixar o envio rápido — GIF nunca entra aqui
// (ver `compressImageFile`).
const COVER_IMAGE_COMPRESS_OPTIONS = {
  maxDimension: 2400,
  targetBytes: 3.5 * 1024 * 1024,
  skipBelowBytes: 3 * 1024 * 1024,
}

/**
 * Upload em duas etapas: pede uma signed URL ao endpoint (que valida sessão,
 * tier e tamanho declarado), sobe os bytes direto pro Storage do Supabase —
 * sem passar pelo corpo de requisição do Route Handler, que a Vercel corta
 * em ~4.5MB — e então confirma com o endpoint, que baixa o arquivo e valida
 * de verdade (magic bytes, tamanho, tier de GIF) antes de liberar a URL
 * pública.
 */
async function uploadProfileMedia(
  endpoint: string,
  file: File
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const startRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
  })
  const startData = (await startRes.json().catch(() => null)) as
    | { error?: string; path?: string; token?: string }
    | null
  if (!startRes.ok || !startData?.path || !startData?.token) {
    return { ok: false, error: startData?.error || "Erro ao iniciar envio." }
  }

  const { error: uploadError } = await supabaseStorageClient.storage
    .from("peripherals")
    .uploadToSignedUrl(startData.path, startData.token, file, { contentType: file.type })
  if (uploadError) {
    return { ok: false, error: "Erro ao enviar arquivo." }
  }

  const finishRes = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: startData.path }),
  })
  const finishData = (await finishRes.json().catch(() => null)) as
    | { error?: string; publicUrl?: string }
    | null
  if (!finishRes.ok || !finishData?.publicUrl) {
    return { ok: false, error: finishData?.error || "Erro ao confirmar envio." }
  }

  return { ok: true, publicUrl: finishData.publicUrl }
}

/**
 * Perfil e vitrine em uma seção só: identidade (banner, avatar, nome, bio) e o
 * que aparece no perfil público (setup, favoritos, medalhas). Os dois grupos
 * batem em endpoints diferentes, mas são salvos pelo mesmo botão.
 */
export function ProfileSection({ profile, onProfileChange }: ProfileSectionProps) {
  const { tier, favoriteLimit, medalLimit, capabilities, animatedMedia, isVip } = useAccountTier(
    profile.account_tier,
    profile.vip_expires_at ?? null
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
  // Enquadramento das três imagens. Não recorta arquivo nenhum: guarda posição
  // e zoom, que a exibição aplica em CSS (ver `lib/profile-media-adjust.ts`).
  const [adjustments, setAdjustments] = useState<ProfileMediaAdjustments>(() =>
    coerceMediaAdjustments(profile.media_adjustments)
  )

  /** Troca o enquadramento de uma das imagens, mantendo as outras. */
  function setAdjust(key: AdjustableMedia, next: MediaAdjust) {
    setAdjustments((current) => ({ ...current, [key]: next }))
  }

  // ── Vitrine ──
  const [loadingShowcase, setLoadingShowcase] = useState(true)
  const [setup, setSetup] = useState<SetupItem[]>([])
  const [favorites, setFavorites] = useState<ShowcasePeripheral[]>([])
  const [allMedals, setAllMedals] = useState<ShowcaseMedal[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  // Troca de nome saiu do fluxo de "Salvar alterações": agora é uma compra
  // paga com Aura, feita pelo modal reutilizável (ver ChangeDisplayNameModal).
  const [nameModalOpen, setNameModalOpen] = useState(false)

  const previewName = displayName.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const specialTag = getSpecialTag(profile.display_slug)
  const slugPreview = profile.display_slug || slugifyDisplayName(displayName) || "seu-nome"
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
      const result = await uploadProfileMedia("/api/profile/upload-avatar", file)
      if (!result.ok) throw new Error(result.error)
      setAvatarUrl(result.publicUrl)
      setAvatarPreview(result.publicUrl)
      setAdjust("avatar", DEFAULT_ADJUST)
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
      const compressed = await compressImageFile(file, COVER_IMAGE_COMPRESS_OPTIONS)
      const result = await uploadProfileMedia("/api/profile/upload-banner", compressed)
      if (!result.ok) throw new Error(result.error)
      setBannerUrl(result.publicUrl)
      // Enquadramento da imagem anterior não vale para a nova.
      setAdjust("banner", DEFAULT_ADJUST)
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
      const compressed = await compressImageFile(file, COVER_IMAGE_COMPRESS_OPTIONS)
      // Rota própria: o fundo do Mini Perfil é uma imagem independente da capa
      // grande, e trocar uma não pode sobrescrever a outra no bucket.
      const result = await uploadProfileMedia("/api/profile/upload-mini-banner", compressed)
      if (!result.ok) throw new Error(result.error)
      setMiniBannerUrl(result.publicUrl)
      setAdjust("mini_banner", DEFAULT_ADJUST)
      toast.success("Fundo do Mini Perfil enviado")
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Erro ao enviar o fundo do Mini Perfil"
      toast.error("Erro ao enviar o fundo do Mini Perfil", { description: message })
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
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
          mini_banner_url: miniBannerUrl,
          media_adjustments: adjustments,
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
      setAdjustments(coerceMediaAdjustments(data.profile.media_adjustments))
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
        <Card className={cn(CARD_SURFACE, "overflow-hidden")}>
          <CardContent className="space-y-6 pt-6">
            {/* Banner grande: preview da página de perfil inteira — a capa
                aparece no contexto real, com a foto sobreposta. */}
            <div className="space-y-2">
              <PreviewLabel
                label="Banner do perfil"
                hint="Capa do topo do seu perfil público."
              />

              <ProfilePagePreview
                banner={bannerPreview}
                bannerAdjust={adjustments.banner}
                avatarAdjust={adjustments.avatar}
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

              {bannerPreview.src && (
                <MediaAdjuster
                  src={bannerPreview.src}
                  animated={bannerPreview.animated}
                  value={adjustments.banner}
                  onChange={(next) => setAdjust("banner", next)}
                  aspect="banner"
                  disabled={uploadingBanner}
                />
              )}
            </div>

            {/* Fundo do Mini Perfil: imagem separada da capa, usada só no
                cartão de preview rápido (hover na foto em /pessoas e no autor
                de um post do fórum). */}
            <div className="space-y-2">
              <PreviewLabel
                label="Fundo do Mini Perfil"
                hint="Aparece no cartão que abre ao passar o mouse na sua foto, em /pessoas e no fórum."
              />

              <MiniBannerCardPreview
                miniBanner={miniBannerPreview}
                miniBannerAdjust={adjustments.mini_banner}
                avatarAdjust={adjustments.avatar}
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

              {miniBannerPreview.src && (
                <MediaAdjuster
                  src={miniBannerPreview.src}
                  animated={miniBannerPreview.animated}
                  value={adjustments.mini_banner}
                  onChange={(next) => setAdjust("mini_banner", next)}
                  aspect="mini"
                  disabled={uploadingMiniBanner}
                />
              )}
            </div>

            {/* Foto: o mesmo enquadramento vale em todo lugar onde ela aparece
                — perfil, card de /pessoas e Mini Perfil. */}
            {avatarPreview && (
              <div className="space-y-2">
                <PreviewLabel
                  label="Enquadramento da foto"
                  hint="Arraste para escolher o que fica dentro do círculo."
                />
                <div className="flex justify-center">
                  <div className="w-32">
                    <MediaAdjuster
                      src={avatarPreview}
                      animated={resolveProfileMedia(avatarUrl, tier).animated}
                      value={adjustments.avatar}
                      onChange={(next) => setAdjust("avatar", next)}
                      aspect="avatar"
                      disabled={uploading}
                    />
                  </div>
                </div>
              </div>
            )}

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
                <div className="flex items-center gap-2">
                  <Input
                    value={displayName}
                    readOnly
                    className="border-border bg-muted/20 text-muted-foreground"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setNameModalOpen(true)}
                    title="Trocar nome"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
                <p className="truncate text-[10px] text-muted-foreground/60">
                  sunano.com.br/perfil/<span className="text-muted-foreground">{slugPreview}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  Trocar nome custa 100 de Aura e tem cooldown de 3 dias.
                </p>
              </div>
            </div>

            <ChangeDisplayNameModal
              open={nameModalOpen}
              onOpenChange={setNameModalOpen}
              currentName={displayName}
              onChanged={(newName, newSlug) => {
                setDisplayName(newName)
                onProfileChange({ ...profile, display_name: newName, display_slug: newSlug })
              }}
            />

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
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-border bg-secondary/90 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <p className="text-xs text-muted-foreground">
          Identidade e vitrine são salvas de uma vez só.
        </p>
        <Button
          onClick={save}
          disabled={saving || uploading || uploadingBanner || uploadingMiniBanner || loadingShowcase}
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
 * Miniatura da página de perfil: capa, foto sobreposta e o resto do perfil em
 * cinza. Espelha `components/profile/ProfileShowcase` — mexer lá pede ajustar
 * aqui, senão o preview mente. Sem o fundo do Mini Perfil: ele é outra
 * feature, e não aparece na página completa.
 */
function ProfilePagePreview({
  banner,
  bannerAdjust,
  avatarAdjust,
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
  bannerAdjust: MediaAdjust
  avatarAdjust: MediaAdjust
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
          // Mesma proporção da capa real (ver BANNER_HEIGHT em ProfileShowcase),
          // reduzida para caber no editor.
          "relative h-36 w-full overflow-hidden sm:h-48",
          !banner.src && "bg-gradient-to-br from-primary/20 via-muted/40 to-background"
        )}
        style={isVip ? { boxShadow: "inset 0 0 0 3px var(--vip-accent)" } : undefined}
      >
        {banner.src && (
          <Image
            src={banner.src}
            alt=""
            fill
            unoptimized={banner.animated}
            sizes="(max-width: 768px) 100vw, 640px"
            style={mediaAdjustStyle(bannerAdjust)}
            className="h-full w-full object-cover"
          />
        )}
        {/* Sem véu escuro, igual ao `Banner` de verdade: não há texto sobre a
            capa, e o degradê só fazia a base dela virar tarja preta junto com
            o fundo do card. */}
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

      {/* Foto quadrada ancorada no canto inferior esquerdo, invadindo a capa
          pela metade — igual ao header público. */}
      <div className="relative px-4 pb-4">
        <div className="absolute -top-10 left-4 sm:-top-12">
          <div className="relative">
            <div
              className={cn("relative size-20 overflow-hidden rounded-xl border-[3px] bg-muted sm:size-24", !isVip && "border-border")}
              style={isVip ? { borderColor: "var(--vip-accent)" } : undefined}
            >
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt={name}
                  fill
                  sizes="96px"
                  style={mediaAdjustStyle(avatarAdjust)}
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-primary/15 text-2xl font-bold text-primary">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            {isVip && (
              <span
                className="absolute -bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-background px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-black shadow-sm"
                style={{ backgroundColor: "var(--vip-accent)" }}
              >
                <Crown className="size-2.5" />
                VIP
              </span>
            )}
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

        <div className="ml-24 flex flex-wrap items-center gap-2 pt-3 sm:ml-28">
          <p className="text-base font-bold text-foreground">{name}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              !isVip && "border-border bg-muted/40 text-muted-foreground"
            )}
            style={isVip ? { borderColor: "var(--vip-accent-soft)", backgroundColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" } : undefined}
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
  miniBannerAdjust,
  avatarAdjust,
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
  miniBannerAdjust: MediaAdjust
  avatarAdjust: MediaAdjust
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
              style={mediaAdjustStyle(miniBannerAdjust)}
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
              className={cn("size-[86px] ring-4", isVip ? "ring-[var(--vip-accent-soft)]" : "ring-background")}
            >
              <AvatarImage
                src={avatarSrc ?? undefined}
                alt={name}
                style={mediaAdjustStyle(avatarAdjust)}
                className="object-cover"
              />
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
            {isVip && <Crown className="size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />}
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
