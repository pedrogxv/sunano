"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import {
  Camera,
  Crown,
  ImagePlus,
  LayoutGrid,
  Palette,
  Pencil,
  Sparkles,
  UserRound,
  Youtube,
} from "lucide-react"
import { toast } from "sonner"

import { FavoritosEditor, MedalhasEditor, SetupEditor } from "./showcase-editors"
import { MediaAdjuster } from "./MediaAdjuster"
import { MediaPickerDialog } from "./MediaPickerDialog"
import { compressImageFile } from "@/lib/client/compress-image"
import type { KlipyGif } from "@/lib/klipy"
import { supabaseStorageClient } from "@/lib/client/supabase-storage"
import {
  coerceMediaAdjustments,
  DEFAULT_ADJUST,
  mediaAdjustStyle,
  type AdjustableMedia,
  type MediaAdjust,
  type ProfileMediaAdjustments,
} from "@/lib/profile-media-adjust"
import { FrozenFrame } from "@/components/ui/image-with-fallback"
import { TikTokIcon } from "@/components/icons/social-icons"
import { resolveProfileMedia, type ProfileMedia } from "@/lib/account-tier"
import { getSpecialTag } from "@/lib/special-tag"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import BoxLoader from "@/components/ui/box-loader"
import { useAccountTier } from "@/lib/hooks/use-account-tier"
import { slugifyDisplayName } from "@/lib/profile-name"
import { ChangeDisplayNameModal } from "@/components/profile/ChangeDisplayNameModal"
import { useAuthUser } from "@/components/providers/auth-context"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { profileFrameOf, type ProfileFrameIdentity } from "@/lib/profile-frames"
import {
  BIO_MAX_LENGTH,
  normalizeSocialHandle,
  type ProfileShowcase,
  type SetupItem,
  type SetupSlot,
  type ShowcaseMedal,
  type ShowcasePeripheral,
} from "@/lib/profile-showcase"
import { MiniProfileBgPicker } from "@/components/account/MiniProfileBgPicker"
import { ProfileFramePicker } from "@/components/account/ProfileFramePicker"
import { MINI_PROFILE_BG_THEMES } from "@/lib/mini-profile-backgrounds"
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
// O upload de perfil vai direto pro Storage por signed URL (sem passar pela
// function), então nem o teto de corpo da function nem o buffer do proxy se aplicam
// (ver `lib/upload-limits.ts`) e o limite podia
// ficar folgado. Só que o arquivo gravado é o que o visitante baixa a cada
// visita ao perfil — daí a poda mais agressiva. O servidor ainda recomprime
// em finalizeProfileMediaUpload; GIF do VIP continua intocado nos dois lados.
const COVER_IMAGE_COMPRESS_OPTIONS = {
  maxDimension: 1920,
  targetBytes: 600 * 1024,
  skipBelowBytes: 200 * 1024,
}

// O avatar nunca é exibido acima de ~128px (`AvatarQuadrado`, `ProfileAvatar`), então
// não há motivo pra subir a foto original da câmera: 512px cobre tela 2x com
// folga. Sem isso o navegador enviava o arquivo cru — o servidor recomprimia
// no finalize, mas o upload gastava banda à toa e, se o passo de confirmação
// falhasse, o original gigante ficava órfão no bucket sem nunca ser reduzido.
const AVATAR_COMPRESS_OPTIONS = {
  maxDimension: 512,
  targetBytes: 120 * 1024,
  skipBelowBytes: 120 * 1024,
}

/** Texto do seletor por mídia — o modal é um só, o contexto muda. */
const MEDIA_PICKER_COPY: Record<AdjustableMedia, { title: string; description: string }> = {
  avatar: {
    title: "Foto de perfil",
    description: "Aparece no seu perfil, nos comentários e em todo lugar que mostra sua conta.",
  },
  banner: {
    title: "Banner do perfil",
    description: "A capa larga do topo do seu perfil público.",
  },
  mini_banner: {
    title: "Fundo do Mini Perfil",
    description: "A faixa do cartão que abre ao passar o mouse na sua foto.",
  },
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
 * Grava um GIF do KLIPY como mídia de perfil. Ao contrário do arquivo local,
 * nada sobe daqui: manda-se só a URL e o servidor baixa, valida e guarda no
 * bucket (ver `importProfileMediaFromKlipy`) — mídia de perfil nunca fica
 * hospedada fora, senão o `image-loader` do Storage não a alcança.
 */
async function importKlipyGif(
  endpoint: string,
  sourceUrl: string
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const res = await fetch(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceUrl }),
  })
  const data = (await res.json().catch(() => null)) as
    | { error?: string; publicUrl?: string }
    | null
  if (!res.ok || !data?.publicUrl) {
    return { ok: false, error: data?.error || "Erro ao salvar o GIF." }
  }
  return { ok: true, publicUrl: data.publicUrl }
}

/**
 * As três abas do editor, na ordem em que a pessoa costuma mexer: primeiro
 * quem ela é (nome, bio, links), depois como isso se veste (enquadramento,
 * moldura, efeito) e por fim o que ela expõe no perfil público.
 *
 * Abas e não uma rolagem só porque os três grupos não se leem juntos: quem
 * veio trocar a bio não precisa passar por 4 slots de setup e pela lista
 * inteira de medalhas para chegar nela. O estado de todos vive no componente
 * pai, então trocar de aba nunca descarta rascunho.
 */
const EDITOR_TABS = [
  { id: "identidade", label: "Identidade", Icon: UserRound },
  { id: "aparencia", label: "Aparência", Icon: Palette },
  { id: "espaco", label: "Meu Espaço", Icon: LayoutGrid },
] as const

type EditorTab = (typeof EDITOR_TABS)[number]["id"]

/**
 * Perfil e vitrine em uma seção só: identidade (banner, avatar, nome, bio) e o
 * que aparece no perfil público (setup, favoritos, medalhas). Os dois grupos
 * batem em endpoints diferentes, mas são salvos pelo mesmo botão.
 */
export function ProfileSection({ profile, onProfileChange }: ProfileSectionProps) {
  // Nome e foto também vivem na topbar/mini perfil, que leem do AuthProvider.
  // Salvar aqui não mexe no cookie de sessão nem dispara evento de auth, então
  // nenhum dos gatilhos do provider percebe a mudança sozinho — sem este
  // `refresh()` o avatar e o nome lá em cima ficam velhos até um F5.
  // A moldura equipada vem do contexto de sessão (`/api/auth/me`), para o
  // preview mostrar exatamente a mesma moldura do perfil público.
  const { user: authUser, refresh: refreshAuthUser } = useAuthUser()
  // A moldura inteira (equipada + VIP + Fundador), e não só a URL: o preview
  // precisa mostrar a MESMA que o público vê, e uma moldura de arte em código
  // (Fundador) não tem URL nenhuma — só a URL fazia o preview sair vazio.
  const previewFrame = profileFrameOf({
    equippedFrameSlug: authUser?.equippedFrameSlug,
    equippedFrameUrl: authUser?.equippedFrameUrl,
    accountTier: authUser?.accountTier,
    vipExpiresAt: authUser?.vipExpiresAt,
    isFounder: authUser?.isFounder,
    longestStreak: authUser?.longestStreak,
    // Sem ele o preview ignorava o "Nenhuma" do seletor logo abaixo: como
    // `profileFrameOf` resolve o campo ausente para `false`, o fallback de
    // honraria voltava a desenhar a moldura de Fundador/VIP — o botão
    // parecia não fazer nada, justo na tela onde ele vive.
    frameOptOut: authUser?.frameOptOut,
  })
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

  // Qual mídia o seletor está editando — `null` com o modal fechado. Um modal
  // só para as três: o que muda é o endpoint e o texto.
  const [picker, setPicker] = useState<AdjustableMedia | null>(null)

  const [saving, setSaving] = useState(false)
  // Troca de nome saiu do fluxo de "Salvar alterações": agora é uma compra
  // paga com Aura, feita pelo modal reutilizável (ver ChangeDisplayNameModal).
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [tab, setTab] = useState<EditorTab>("identidade")

  const previewName = displayName.trim() || (profile.email?.split("@")[0] ?? "Usuário")
  const specialTag = getSpecialTag(profile.display_slug)
  const slugPreview = profile.display_slug || slugifyDisplayName(displayName) || "seu-nome"
  // GIF só entra no seletor de arquivos de quem pode usá-lo; a API valida de novo.
  const imageAccept = animatedMedia
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "image/jpeg,image/png,image/webp"
  // O preview passa pelas mesmas regras de tier do perfil público: um GIF de
  // conta comum aparece parado aqui, exatamente como vai aparecer lá.
  const bannerPreview = resolveProfileMedia(bannerUrl, tier, profile.vip_expires_at ?? null)
  const miniBannerPreview = resolveProfileMedia(miniBannerUrl, tier, profile.vip_expires_at ?? null)
  const avatarMediaPreview = resolveProfileMedia(avatarUrl, tier, profile.vip_expires_at ?? null)
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

  async function handleAvatarFile(file: File) {
    try {
      setUploading(true)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(file)
      const compressed = await compressImageFile(file, AVATAR_COMPRESS_OPTIONS)
      const result = await uploadProfileMedia("/api/profile/upload-avatar", compressed)
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

  async function handleAvatarGif(gif: KlipyGif) {
    try {
      setUploading(true)
      // Preview otimista: mostra o GIF do CDN enquanto o servidor copia pro
      // bucket. A URL definitiva substitui abaixo.
      setAvatarPreview(gif.url)
      const result = await importKlipyGif("/api/profile/upload-avatar", gif.url)
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

  async function handleBannerFile(file: File) {
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

  async function handleBannerGif(gif: KlipyGif) {
    try {
      setUploadingBanner(true)
      const result = await importKlipyGif("/api/profile/upload-banner", gif.url)
      if (!result.ok) throw new Error(result.error)
      setBannerUrl(result.publicUrl)
      setAdjust("banner", DEFAULT_ADJUST)
      toast.success("Banner enviado")
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao enviar banner"
      toast.error("Erro ao enviar banner", { description: message })
    } finally {
      setUploadingBanner(false)
    }
  }

  async function handleMiniBannerFile(file: File) {
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

  async function handleMiniBannerGif(gif: KlipyGif) {
    try {
      setUploadingMiniBanner(true)
      const result = await importKlipyGif("/api/profile/upload-mini-banner", gif.url)
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
      refreshAuthUser()
      toast.success("Perfil salvo")
    } finally {
      setSaving(false)
    }
  }

  // Aba aberta. O estado inteiro do formulário vive AQUI no pai, então trocar
  // de aba não perde rascunho nenhum — e os painéis ainda são montados com
  // `forceMount` para o estado LOCAL de cada editor (o `PeripheralPicker`
  // aberto num slot, o acordeão de molduras bloqueadas) sobreviver à troca.
  const busy = uploading || uploadingBanner || uploadingMiniBanner
  const hasAnyMedia = Boolean(bannerPreview.src || miniBannerPreview.src || avatarPreview)

  return (
    <div className="space-y-6">
      {/* Duas colunas a partir de `xl`: os previews de um lado, sempre à
          vista, e os controles do outro.

          Era tudo uma coluna só dentro de um `max-w-4xl`, e a consequência não
          era estética: o preview ficava no topo e os campos que ele reflete
          (bio, sociais) uns 800px abaixo, então quem digitava a bio não via o
          resultado sem rolar de volta. Com a coluna esquerda `sticky`, cada
          tecla aparece no mesmo enquadramento em que o público vai ver. */}
      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)] 2xl:grid-cols-[26rem_minmax(0,1fr)]">
        {/* ── Coluna de previews ── */}
        {/* `top-20` e não `top-6`: a TopBar é `sticky top-0` com `min-h-16`
            (64px), então qualquer valor menor prenderia o preview PARCIALMENTE
            atrás dela — a capa ficaria cortada justo enquanto a pessoa a
            enquadra. Os 80px são a barra mais um respiro. */}
        <aside className="xl:sticky xl:top-20 xl:self-start">
          {/* Rolagem própria: os dois previews somados passam de 800px, e uma
              coluna mais alta que a viewport simplesmente NÃO gruda — o
              `sticky` só segura enquanto o elemento cabe na tela. Sem isto o
              preview voltaria a sumir ao rolar, que é o problema que esta
              coluna existe para resolver. `-mx-1 px-1` dá folga lateral para o
              anel de foco dos botões não ser cortado pelo `overflow`. */}
          <div className="-mx-1 space-y-4 px-1 xl:pb-2">
            <PreviewLabel
              label="Como você aparece"
              hint="Passe o mouse em qualquer imagem para trocá-la. É assim que o site inteiro vê você."
            />

            {/* Os dois previews empilhados dentro da coluna estreita, e lado a
                lado enquanto ela não existe (abaixo de `xl`, onde a página
                volta a ser uma coluna só). A foto é COMPARTILHADA pelos dois:
                mantê-los na mesma vista é o que faz um clique na foto ser
                visível nos dois lugares ao mesmo tempo. */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <PreviewFrame label="Perfil público" hint="sunano.com.br/perfil">
                <ProfilePagePreview
                  banner={bannerPreview}
                  bannerAdjust={adjustments.banner}
                  avatarAdjust={adjustments.avatar}
                  avatarSrc={avatarPreview}
                  name={previewName}
                  tierLabel={capabilities.label}
                  isVip={isVip}
                  previewFrame={previewFrame}
                  specialTag={specialTag}
                  bio={bio}
                  youtubeHandle={youtubeHandle}
                  tiktokHandle={tiktokHandle}
                  uploadingAvatar={uploading}
                  onEditAvatar={() => setPicker("avatar")}
                  uploadingBanner={uploadingBanner}
                  onEditBanner={() => setPicker("banner")}
                />
              </PreviewFrame>

              <PreviewFrame label="Mini Perfil" hint="hover no fórum e em /pessoas">
                <MiniBannerCardPreview
                  miniBanner={miniBannerPreview}
                  miniBannerAdjust={adjustments.mini_banner}
                  avatarAdjust={adjustments.avatar}
                  avatarSrc={avatarPreview}
                  name={previewName}
                  previewFrame={previewFrame}
                  specialTag={specialTag}
                  accentHue={accentHue}
                  uploadingAvatar={uploading}
                  onEditAvatar={() => setPicker("avatar")}
                  uploadingMiniBanner={uploadingMiniBanner}
                  onEditMiniBanner={() => setPicker("mini_banner")}
                />
              </PreviewFrame>
            </div>

            {/* Atalho para as três imagens. Antes a única forma de trocar uma
                foto era descobrir que o preview era clicável — o que é
                elegante mas invisível; aqui os mesmos três destinos ficam
                escritos, e o botão diz se já existe imagem ou não. */}
            <div className="grid grid-cols-3 gap-2">
              <MediaShortcut
                label="Foto"
                filled={Boolean(avatarPreview)}
                busy={uploading}
                onClick={() => setPicker("avatar")}
              />
              <MediaShortcut
                label="Capa"
                filled={Boolean(bannerPreview.src)}
                busy={uploadingBanner}
                onClick={() => setPicker("banner")}
              />
              <MediaShortcut
                label="Fundo mini"
                filled={Boolean(miniBannerPreview.src)}
                busy={uploadingMiniBanner}
                onClick={() => setPicker("mini_banner")}
              />
            </div>
          </div>
        </aside>

        {/* ── Coluna de controles ── */}
        <Tabs value={tab} onValueChange={(next) => setTab(next as EditorTab)} className="gap-4">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            {EDITOR_TABS.map(({ id, label, Icon }) => (
              <TabsTrigger key={id} value={id} className="flex-none gap-1.5 px-3">
                <Icon className="size-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Identidade: os campos de texto ── */}
          <TabsContent value="identidade" forceMount hidden={tab !== "identidade"}>
            <Card className={cn(CARD_SURFACE)}>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
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
                      sunano.com.br/perfil/
                      <span className="text-muted-foreground">{slugPreview}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      {/* O valor exato (com o desconto VIP) aparece no modal, que
                          o busca do servidor — repetir um número aqui só criava
                          duas fontes de verdade pro mesmo preço. */}
                      Trocar nome custa Aura e tem cooldown de 3 dias.
                    </p>
                  </div>

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
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Bio
                    </label>
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        bio.length >= BIO_MAX_LENGTH
                          ? "font-semibold text-primary"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {bio.length}/{BIO_MAX_LENGTH}
                    </span>
                  </div>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
                    className="border-border bg-background min-h-24 resize-none"
                    placeholder="Uma linha sobre você: aparece no seu perfil público."
                    maxLength={BIO_MAX_LENGTH}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
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
          </TabsContent>

          {/* ── Aparência: enquadramento, moldura e efeito ── */}
          <TabsContent
            value="aparencia"
            forceMount
            hidden={tab !== "aparencia"}
            className="space-y-4"
          >
            {/* Enquadramentos juntos, num painel só, e só para as imagens que
                existem. Antes cada ajustador ficava colado ao seu preview,
                empurrando o de baixo para longe; e o da foto, que muda os DOIS
                previews, aparecia por último, longe de ambos. O painel inteiro
                some quando não há imagem nenhuma, em vez de deixar rótulos
                órfãos. */}
            <Card className={cn(CARD_SURFACE)}>
              <CardContent className="space-y-4">
                <PreviewLabel
                  label="Enquadramento"
                  hint="Arraste para escolher o que fica visível; o zoom aproxima. Nada recorta o arquivo enviado."
                />

                {hasAnyMedia ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {bannerPreview.src && (
                      <AdjusterField label="Banner do perfil">
                        <MediaAdjuster
                          src={bannerPreview.src}
                          animated={bannerPreview.animated}
                          freeze={bannerPreview.needsFreeze}
                          value={adjustments.banner}
                          onChange={(next) => setAdjust("banner", next)}
                          aspect="banner"
                          disabled={uploadingBanner}
                        />
                      </AdjusterField>
                    )}

                    {miniBannerPreview.src && (
                      <AdjusterField label="Fundo do Mini Perfil">
                        <MediaAdjuster
                          src={miniBannerPreview.src}
                          animated={miniBannerPreview.animated}
                          freeze={miniBannerPreview.needsFreeze}
                          value={adjustments.mini_banner}
                          onChange={(next) => setAdjust("mini_banner", next)}
                          aspect="mini"
                          disabled={uploadingMiniBanner}
                        />
                      </AdjusterField>
                    )}

                    {avatarPreview && (
                      <AdjusterField
                        label="Foto de perfil"
                        hint="Vale nos dois previews e em todo o site."
                      >
                        <div className="w-32">
                          <MediaAdjuster
                            src={avatarPreview}
                            animated={avatarMediaPreview.animated}
                            freeze={avatarMediaPreview.needsFreeze}
                            value={adjustments.avatar}
                            onChange={(next) => setAdjust("avatar", next)}
                            aspect="avatar"
                            disabled={uploading}
                          />
                        </div>
                      </AdjusterField>
                    )}
                  </div>
                ) : (
                  <EmptyHint
                    Icon={ImagePlus}
                    title="Nenhuma imagem enviada ainda"
                    description="Envie uma foto, uma capa ou um fundo de Mini Perfil e o enquadramento aparece aqui."
                    action={
                      <Button type="button" variant="outline" size="sm" onClick={() => setPicker("avatar")}>
                        Enviar foto de perfil
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>

            {/* A moldura do avatar. Fica ANTES do efeito de Mini Perfil
                porque aparece no site inteiro (fórum, comentários, ranking),
                enquanto o fundo só aparece no cartão de hover.

                Equipar aqui é imediato (POST próprio) e NÃO depende do
                "Salvar" do formulário — é posse de item, não campo do perfil.
                O `refreshAuthUser` é o que faz a escolha aparecer na hora nos
                dois previews ao lado e na topbar: a moldura viaja pelo contexto
                de sessão, que nenhum gatilho do provider revalida sozinho. */}
            {/* `id` é o destino do link da notificação de moldura nova
                (`notifyRankFrameGranted`): quem acabou de ganhar chega já
                com o seletor na tela, em vez de cair no topo do editor de
                perfil e ter de procurar. `scroll-mt` compensa o cabeçalho
                fixo, senão a âncora para com o card por baixo dele. */}
            <Card id="moldura" className={cn(CARD_SURFACE, "scroll-mt-24")}>
              <CardContent className="space-y-3 pt-6">
                <PreviewLabel
                  label="Moldura do avatar"
                  hint="O anel em volta da sua foto, em todo o site. Conquistadas na Ofensiva, no pódio dos rankings, com o VIP ou na Central de Aura."
                />
                <ProfileFramePicker onEquipChange={refreshAuthUser} />
              </CardContent>
            </Card>

            {/* Tema animado do cartão, comprado na Central de Aura. Equipar
                aqui também é imediato, pelo mesmo motivo da moldura.

                Sai de cena junto com o seletor enquanto não houver fundo
                nenhum à venda: rótulo sem nada embaixo é pior que ausência. */}
            {MINI_PROFILE_BG_THEMES.length > 0 && (
              <Card className={cn(CARD_SURFACE)}>
                <CardContent className="space-y-3 pt-6">
                  <PreviewLabel
                    label="Efeito do Mini Perfil"
                    hint="Temas animados comprados na Central de Aura. Equipe um para o seu cartão ganhar borda com brilho, raios e partículas."
                  />
                  <MiniProfileBgPicker />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Meu Espaço: a vitrine do perfil público ── */}
          <TabsContent value="espaco" forceMount hidden={tab !== "espaco"} className="space-y-4">
            {loadingShowcase ? (
              <div className="flex min-h-64 items-center justify-center">
                <BoxLoader />
              </div>
            ) : (
              <>
                {/* Setup e favoritos lado a lado: são duas listas curtas, e em
                    coluna única a segunda nascia fora da tela. Medalhas ficam
                    na largura inteira porque a lista é a mais longa das três. */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <SetupEditor setup={setup} onChange={updateSlot} />
                  <FavoritosEditor
                    favorites={favorites}
                    limit={favoriteLimit}
                    tierLabel={capabilities.label}
                    onChange={setFavorites}
                  />
                </div>
                <MedalhasEditor
                  medals={allMedals}
                  pinnedIds={pinnedIds}
                  limit={medalLimit}
                  onChange={setPinnedIds}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ChangeDisplayNameModal
        open={nameModalOpen}
        onOpenChange={setNameModalOpen}
        currentName={displayName}
        onChanged={(newName, newSlug) => {
          setDisplayName(newName)
          onProfileChange({ ...profile, display_name: newName, display_slug: newSlug })
          refreshAuthUser()
        }}
      />

      {/* Um seletor para as três mídias: arrastar-e-soltar, explorador de
          arquivos ou GIF do KLIPY. O que muda por mídia é só o destino. */}
      <MediaPickerDialog
        open={picker !== null}
        onOpenChange={(next) => {
          if (!next) setPicker(null)
        }}
        title={picker ? MEDIA_PICKER_COPY[picker].title : ""}
        description={picker ? MEDIA_PICKER_COPY[picker].description : undefined}
        accept={imageAccept}
        allowGif={animatedMedia}
        busy={busy}
        onPickFile={(file) => {
          if (picker === "avatar") handleAvatarFile(file)
          else if (picker === "banner") handleBannerFile(file)
          else if (picker === "mini_banner") handleMiniBannerFile(file)
        }}
        onPickGif={(gif) => {
          if (picker === "avatar") handleAvatarGif(gif)
          else if (picker === "banner") handleBannerGif(gif)
          else if (picker === "mini_banner") handleMiniBannerGif(gif)
        }}
      />

      {/* Barra de salvamento — identidade e vitrine vão juntas. Fica fora do
          grid e presa ao rodapé: com as abas, o botão precisa alcançar as três
          de uma vez, e o que se salva não muda com a aba aberta. */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-border bg-secondary/90 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <p className="text-xs text-muted-foreground">
          Identidade e vitrine são salvas de uma vez só. Molduras e efeitos são aplicados na hora.
        </p>
        <Button
          onClick={save}
          disabled={saving || busy || loadingShowcase}
          className="min-w-40"
        >
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Atalho escrito para trocar uma das três imagens.
 *
 * O preview já é clicável, mas isso é descoberta por acaso: quem não passa o
 * mouse em cima de uma capa vazia nunca descobre que ela abre o seletor. O
 * ponto aqui é dizer em palavras o que existe e se já está preenchido.
 */
function MediaShortcut({
  label,
  filled,
  busy,
  onClick,
}: {
  label: string
  filled: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors",
        "hover:border-border hover:bg-muted/40 disabled:opacity-60",
        filled ? "border-border/60 bg-muted/20" : "border-dashed border-border/60"
      )}
    >
      <Camera className={cn("size-3.5", busy && "animate-pulse")} />
      <span className="text-[11px] font-medium leading-none text-foreground">{label}</span>
      <span className="text-[10px] leading-none text-muted-foreground/60">
        {busy ? "Enviando..." : filled ? "Trocar" : "Adicionar"}
      </span>
    </button>
  )
}

/** Estado vazio de um painel: ícone, frase e a ação que o preenche. */
function EmptyHint({
  Icon,
  title,
  description,
  action,
}: {
  Icon: typeof ImagePlus
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-center">
      <Icon className="size-5 text-muted-foreground/50" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-1">{action}</div>}
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
 * Um preview e o seu rótulo. Cada preview é a réplica de uma tela real, e
 * sem dizer QUAL tela ele fica sendo "um quadradinho com a sua foto" — o
 * rótulo é o que transforma o par em uma comparação legível.
 */
function PreviewFrame({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
          {label}
        </span>
        <span className="truncate text-[10px] text-muted-foreground/60">{hint}</span>
      </div>
      {children}
    </div>
  )
}

/** Um enquadramento dentro do painel de ajustes. */
function AdjusterField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
    </div>
  )
}

/**
 * Botão de trocar a imagem, sobreposto à mídia que ele edita.
 *
 * Centralizado nela, não colado num canto: o canto inferior da foto é onde o
 * emblema da moldura mora (`BADGE_ANCHOR` em `ProfileAvatar`), e os dois
 * disputavam o mesmo pixel — a câmera aparecia por cima da pastilha de
 * Fundador. Sobre a capa ele também sai do caminho do véu.
 *
 * Só ganha fundo no hover/foco: em repouso o preview precisa mostrar a
 * imagem, não o chrome do editor.
 */
function MediaEditButton({
  onClick,
  busy,
  label,
  size = "md",
  className,
}: {
  onClick: () => void
  busy: boolean
  label: string
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={cn(
        "group/edit absolute inset-0 z-30 flex cursor-pointer items-center justify-center rounded-[inherit] transition-colors",
        busy ? "bg-background/60" : "bg-transparent hover:bg-background/45 focus-visible:bg-background/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-sm transition-all",
          size === "sm" ? "size-7" : "size-9",
          busy
            ? "animate-pulse opacity-100"
            : "opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
        )}
      >
        <Camera className={size === "sm" ? "size-3.5" : "size-4"} />
      </span>
    </button>
  )
}

/**
 * Miniatura da página de perfil: capa, foto sobreposta, nome, badges, bio e
 * links sociais. Espelha `components/profile/ProfileShowcase` — mexer lá pede
 * ajustar aqui, senão o preview mente. Sem o fundo do Mini Perfil: ele é outra
 * feature, e não aparece na página completa.
 *
 * O que este preview aprendeu a não fazer:
 *
 * - **Não espremer o token do avatar.** A foto é `size="2xl"` porque é a mesma
 *   do perfil real (`AvatarQuadrado`), e o token calibra anel, emblema e
 *   `sizes` para ~128px. Forçar `size-20` por `wrapperClassName` mantinha o
 *   emblema de 26px sobre uma foto de 80px — era a pastilha "FUNDADOR"
 *   ocupando metade do rosto e cobrindo o nome. Quem encolhe agora é o
 *   container inteiro, por `scale`, então a proporção do conjunto se mantém.
 * - **Não pintar sinal de tier na capa.** O `Banner` real tirou a borda VIP do
 *   rodapé de propósito (ver o comentário lá): ela costurava capa e corpo numa
 *   faixa roxa atravessando o perfil. Aqui ela tinha sobrevivido.
 * - **Não velar a capa.** O `Banner` real não tem degradê: o texto fica abaixo
 *   dela, não há o que proteger. O véu só apagava o terço de baixo da imagem
 *   que a pessoa está justamente tentando enquadrar.
 */
function ProfilePagePreview({
  banner,
  bannerAdjust,
  avatarAdjust,
  avatarSrc,
  name,
  tierLabel,
  isVip,
  previewFrame,
  specialTag,
  bio,
  youtubeHandle,
  tiktokHandle,
  uploadingAvatar,
  onEditAvatar,
  uploadingBanner,
  onEditBanner,
}: {
  banner: ProfileMedia
  bannerAdjust: MediaAdjust
  avatarAdjust: MediaAdjust
  avatarSrc: string | null
  name: string
  tierLabel: string
  isVip: boolean
  /** Moldura cosmética equipada — o preview desenha a mesma do perfil real. */
  previewFrame: ProfileFrameIdentity
  specialTag: ReturnType<typeof getSpecialTag>
  /** Bio e handles em edição: o preview mostra o rascunho, não o salvo. */
  bio: string
  youtubeHandle: string
  tiktokHandle: string
  uploadingAvatar: boolean
  onEditAvatar: () => void
  uploadingBanner: boolean
  onEditBanner: () => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          // Mesma proporção da capa real (ver BANNER_HEIGHT em ProfileShowcase),
          // reduzida para caber no editor. Sem borda de tier: a capa real não
          // desenha sinal nenhum (ver `Banner`).
          "relative h-32 w-full overflow-hidden sm:h-40",
          !banner.src && "bg-gradient-to-br from-primary/20 via-muted/40 to-background"
        )}
      >
        {banner.src && (
          banner.needsFreeze ? (
            <FrozenFrame
              src={banner.src}
              alt=""
              fill
              style={mediaAdjustStyle(bannerAdjust)}
              className="h-full w-full object-cover"
              onError={() => {}}
            />
          ) : (
            <Image
              src={banner.src}
              alt=""
              fill
              unoptimized={banner.animated}
              sizes="(max-width: 768px) 100vw, 640px"
              style={mediaAdjustStyle(bannerAdjust)}
              className="h-full w-full object-cover"
            />
          )
        )}
        <MediaEditButton
          onClick={onEditBanner}
          busy={uploadingBanner}
          label={banner.src ? "Trocar banner" : "Adicionar banner"}
        />
        {!banner.src && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Sem capa
          </span>
        )}
      </div>

      {/* Foto quadrada centralizada, invadindo a capa pela metade — igual ao
          header público (`ProfileShowcase`), que a centraliza para o bloco de
          nome/badges também poder ficar centralizado abaixo dela.

          O avatar mantém o token `2xl` inteiro e é o WRAPPER que encolhe, por
          `scale`: assim anel, emblema e pastilha do badge continuam na
          proporção que o componente calibrou — espremer o token por
          `wrapperClassName` mantinha o emblema no tamanho de uma foto de
          128px sobre uma de 80px, e era o que punha a pastilha "FUNDADOR"
          por cima do rosto e do nome.

          `scale` não muda o espaço que o elemento ocupa, então a geometria é
          feita à mão: o token vale 96px (`size-24`) / 112px em `sm`, e a
          escala o deixa em ~60px / ~78px. `origin-top` fixa o topo, e o
          `-top-*` é metade da altura JÁ ESCALADA — é assim que a foto invade
          a capa pela metade, como no perfil real. */}
      <div className="relative px-4 pb-4">
        <div className="absolute -top-[30px] left-1/2 -translate-x-1/2 sm:-top-[39px]">
          <div className="relative origin-top scale-[0.62] sm:scale-[0.7]">
            {/* Mesmo componente do perfil real (`AvatarQuadrado` também o usa):
                o preview precisa mostrar a MESMA moldura que o público vai
                ver, senão ele mente sobre o resultado. */}
            <ProfileAvatar
              name={name}
              avatarUrl={avatarSrc}
              size="2xl"
              shape="rounded"
              frame={previewFrame}
              adjust={avatarAdjust}
              showBadgeText
            />
            {/* O `scale` do wrapper encolhe este botão junto — sem o
                contra-escala o ícone sairia em ~9px, menor que o do mini
                perfil ao lado. `[&>span]` porque quem precisa voltar ao
                tamanho é a pastilha, não a área clicável. */}
            <MediaEditButton
              onClick={onEditAvatar}
              busy={uploadingAvatar}
              label={avatarSrc ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
              className="rounded-xl [&>span]:scale-[1.6] sm:[&>span]:scale-[1.43]"
            />
          </div>
        </div>

        {/* Espaço reservado = a metade da foto (escalada) que desce no corpo,
            mais a pastilha do emblema, que ainda cai um terço abaixo dela. */}
        <div className="flex flex-col items-center pt-11 text-center sm:pt-14">
          <div className="flex flex-wrap items-center justify-center gap-2">
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

          {/* Bio e sociais em tempo real, do rascunho: são os dois campos que
              a pessoa digita mais abaixo nesta mesma tela, e ver onde eles
              caem é o que faz o preview valer algo. O placeholder em itálico
              ocupa o mesmo espaço para o layout não pular ao digitar. */}
          <p
            className={cn(
              "mt-2 line-clamp-2 max-w-xs text-xs leading-relaxed",
              bio.trim() ? "text-muted-foreground" : "italic text-muted-foreground/40"
            )}
          >
            {bio.trim() || "Sua bio aparece aqui."}
          </p>

          {(youtubeHandle || tiktokHandle) && (
            <div className="mt-2.5 flex items-center gap-2">
              {youtubeHandle && (
                <span className="flex size-7 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground">
                  <Youtube className="size-3.5" />
                </span>
              )}
              {tiktokHandle && (
                <span className="flex size-7 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground">
                  <TikTokIcon className="size-3.5" />
                </span>
              )}
            </div>
          )}

          {/* Setup, medalhas e favoritos entram em cinza: aqui eles só situam a
              capa — quem edita esses blocos é a seção Meu Espaço, mais abaixo. */}
          <div className="mt-4 w-full space-y-3 opacity-40" aria-hidden>
            <PreviewSkeletonRow columns={5} />
            <PreviewSkeletonRow columns={4} />
          </div>
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
  previewFrame,
  specialTag,
  accentHue,
  uploadingAvatar,
  onEditAvatar,
  uploadingMiniBanner,
  onEditMiniBanner,
}: {
  miniBanner: ProfileMedia
  miniBannerAdjust: MediaAdjust
  avatarAdjust: MediaAdjust
  avatarSrc: string | null
  name: string
  /**
   * Moldura cosmética equipada — o preview desenha a mesma do perfil real, e
   * é ela que carrega o sinal de VIP. O card não recebe `isVip`: repetir o
   * sinal ao lado do nome é exatamente o que `ProfileCard` já evita.
   */
  previewFrame: ProfileFrameIdentity
  specialTag: ReturnType<typeof getSpecialTag>
  accentHue: number
  uploadingAvatar: boolean
  onEditAvatar: () => void
  uploadingMiniBanner: boolean
  onEditMiniBanner: () => void
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
            miniBanner.needsFreeze ? (
              <FrozenFrame
                src={miniBanner.src}
                alt=""
                fill
                style={mediaAdjustStyle(miniBannerAdjust)}
                className="object-cover"
                onError={() => {}}
              />
            ) : (
              <Image
                src={miniBanner.src}
                alt=""
                fill
                unoptimized={miniBanner.animated}
                sizes="240px"
                style={mediaAdjustStyle(miniBannerAdjust)}
                className="object-cover"
              />
            )
          )}
          {/* Mesmo véu do card real (`ProfileCard`): a foto sobe por cima da
              faixa e precisa de contraste sob ela. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          <MediaEditButton
            onClick={onEditMiniBanner}
            busy={uploadingMiniBanner}
            label={miniBanner.src ? "Trocar fundo do Mini Perfil" : "Adicionar fundo do Mini Perfil"}
            size="sm"
          />
        </div>

        <div className="-mt-11 flex flex-col items-center px-3 pb-3">
          <div className="relative">
            {/* Mesmo componente do Mini Perfil real (`MiniProfileCard`). */}
            <ProfileAvatar
              name={name}
              avatarUrl={avatarSrc}
              size="xl"
              frame={previewFrame}
              adjust={avatarAdjust}
              wrapperClassName="size-[86px]"
            />
            <MediaEditButton
              onClick={onEditAvatar}
              busy={uploadingAvatar}
              label={avatarSrc ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
              size="sm"
            />
          </div>

          <p className="mt-2.5 flex w-full items-center justify-center gap-1 text-[15px] font-bold leading-tight text-foreground">
            <span className="truncate">{name}</span>
            {/* Sem coroa: o selo de VIP vem na moldura do avatar, igual ao
                `MiniProfileCard` real — o preview tem que bater com ele. */}
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
