"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, Upload, ImageIcon, FileText, Link2, Eye, EyeOff, Search, CheckCircle2, Circle, Youtube } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { BLOG_IMAGE_STANDARDS } from "@/lib/blog-images"
import { useLocale } from "@/lib/locale-context"
import { supabase } from "@/lib/supabase"

type PeripheralOption = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string | null
}

const postSchema = z.object({
  peripheral_id: z.string().min(1, "Select a peripheral"),
  title: z.string().min(5, "Title must have at least 5 characters"),
  excerpt: z.string().optional(),
  cover_image_url: z.string().url("Invalid image URL").optional().or(z.literal("")),
  cover_thumbnail_url: z.string().url("Invalid image URL").optional().or(z.literal("")),
  video_url: z.string().url("Invalid video URL").optional().or(z.literal("")),
  content: z.string().min(20, "Content must have at least 20 characters"),
  status: z.enum(["published", "draft"]),
})

type PostFormData = z.infer<typeof postSchema>

interface BlogPostFormProps {
  postId?: string
}

export function BlogPostForm({ postId }: BlogPostFormProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState<"header" | "thumbnail" | null>(null)
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null)
  const [thumbnailImageFile, setThumbnailImageFile] = useState<File | null>(null)
  const [headerPreview, setHeaderPreview] = useState<string | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)
  const [peripherals, setPeripherals] = useState<PeripheralOption[]>([])
  const [peripheralsLoading, setPeripheralsLoading] = useState(true)
  const [peripheralSearch, setPeripheralSearch] = useState("")

  const form = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      peripheral_id: "",
      title: "",
      excerpt: "",
      cover_image_url: "",
      cover_thumbnail_url: "",
      video_url: "",
      content: "",
      status: "published",
    },
  })

  const watchedStatus = form.watch("status")
  const watchedPeripheralId = form.watch("peripheral_id")
  const watchedContent = form.watch("content")
  const watchedTitle = form.watch("title")

  useEffect(() => { loadPeripherals() }, [])
  useEffect(() => { if (postId) loadPost(postId) }, [postId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPeripherals() {
    setPeripheralsLoading(true)
    const { data, error: err } = await supabase
      .from("peripherals")
      .select("id, name, brand, category, image_url")
      .order("brand", { ascending: true })
    if (err) setError(err.message)
    setPeripherals(data ?? [])
    setPeripheralsLoading(false)
  }

  async function loadPost(id: string) {
    const { data, error: err } = await supabase.from("blog_posts").select("id, title, slug, peripheral_id, excerpt, cover_image_url, cover_thumbnail_url, video_url, content, is_published").eq("id", id).single()
    if (err) { setError(err.message); return }
    form.reset({
      peripheral_id: data.peripheral_id,
      title: data.title,
      excerpt: data.excerpt ?? "",
      cover_image_url: data.cover_image_url ?? "",
      cover_thumbnail_url: data.cover_thumbnail_url ?? "",
      video_url: data.video_url ?? "",
      content: data.content,
      status: data.is_published ? "published" : "draft",
    })
    setHeaderPreview(data.cover_image_url ?? null)
    setThumbnailPreview(data.cover_thumbnail_url ?? null)
  }

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>, variant: "header" | "thumbnail") => {
    const file = event.target.files?.[0]
    if (!file) return
    if (variant === "header") setHeaderImageFile(file)
    else setThumbnailImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      if (variant === "header") setHeaderPreview(reader.result as string)
      else setThumbnailPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function onSubmit(values: PostFormData) {
    try {
      setSaving(true)
      setError(null)
      let coverImageUrl = values.cover_image_url?.trim() || null
      let coverThumbnailUrl = values.cover_thumbnail_url?.trim() || null

      if (headerImageFile) {
        setUploadingCover("header")
        const body = new FormData()
        body.append("file", headerImageFile)
        body.append("title", values.title)
        body.append("variant", "header")
        const res = await fetch("/api/admin/blog/upload-cover", { method: "POST", body })
        const data = await res.json().catch(() => null) as { error?: string; publicUrl?: string } | null
        if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? (isEnglish ? "Failed to upload cover" : "Erro ao enviar capa"))
        coverImageUrl = data.publicUrl
      }

      if (thumbnailImageFile) {
        setUploadingCover("thumbnail")
        const body = new FormData()
        body.append("file", thumbnailImageFile)
        body.append("title", values.title)
        body.append("variant", "thumbnail")
        const res = await fetch("/api/admin/blog/upload-cover", { method: "POST", body })
        const data = await res.json().catch(() => null) as { error?: string; publicUrl?: string } | null
        if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? (isEnglish ? "Failed to upload thumbnail" : "Erro ao enviar miniatura"))
        coverThumbnailUrl = data.publicUrl
      }

      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: postId,
          peripheral_id: values.peripheral_id,
          title: values.title,
          excerpt: values.excerpt?.trim() || null,
          cover_image_url: coverImageUrl,
          cover_thumbnail_url: coverThumbnailUrl,
          video_url: values.video_url?.trim() || null,
          content: values.content,
          is_published: values.status === "published",
        }),
      })

      const data = await res.json().catch(() => null) as { error?: string; ok?: boolean } | null
      if (!res.ok) throw new Error(data?.error ?? (isEnglish ? "Failed to save article" : "Erro ao salvar artigo"))
      router.push("/admin/blog")
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save article" : "Erro ao salvar artigo"))
    } finally {
      setUploadingCover(null)
      setSaving(false)
    }
  }

  const selectedHeaderUrl = headerPreview ?? form.watch("cover_image_url")
  const selectedThumbnailUrl = thumbnailPreview ?? form.watch("cover_thumbnail_url")
  const selectedPeripheral = peripherals.find((p) => p.id === watchedPeripheralId)

  const filteredPeripherals = useMemo(() => {
    const q = peripheralSearch.toLowerCase()
    return peripherals.filter((p) =>
      !q || p.brand.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    )
  }, [peripherals, peripheralSearch])

  const isBusy = saving || Boolean(uploadingCover)

  return (
    <div className="space-y-0 pb-10">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between px-6 py-3">
        <Link href="/admin/blog">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" />
            {isEnglish ? "Articles" : "Artigos"}
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          {/* Status toggle */}
          <button
            type="button"
            onClick={() => form.setValue("status", watchedStatus === "published" ? "draft" : "published")}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
              watchedStatus === "published"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {watchedStatus === "published"
              ? <><Eye className="size-3.5" />{isEnglish ? "Published" : "Publicado"}</>
              : <><EyeOff className="size-3.5" />{isEnglish ? "Draft" : "Rascunho"}</>}
          </button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isBusy} size="sm" className="min-w-28">
            {isBusy
              ? (uploadingCover === "header"
                ? (isEnglish ? "Uploading header..." : "Enviando header...")
                : uploadingCover === "thumbnail"
                  ? (isEnglish ? "Uploading thumbnail..." : "Enviando miniatura...")
                  : (isEnglish ? "Saving..." : "Salvando..."))
              : postId
                ? (isEnglish ? "Save changes" : "Salvar alterações")
                : (isEnglish ? "Publish" : "Publicar")}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        {/* Title — proeminente */}
        <div className="space-y-1.5">
          <Input
            className="border-0 border-b border-border rounded-none bg-transparent px-0 text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-primary"
            placeholder={isEnglish ? "Article title..." : "Título do artigo..."}
            {...form.register("title")}
          />
          {form.formState.errors.title && (
            <p className="text-xs text-red-400">{form.formState.errors.title.message}</p>
          )}
          {watchedTitle && (
            <p className="text-[10px] text-muted-foreground">{watchedTitle.length} {isEnglish ? "chars" : "caracteres"}</p>
          )}
        </div>

        {/* Excerpt */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isEnglish ? "Summary / excerpt" : "Resumo / excerpt"}
          </label>
          <Textarea
            className="min-h-16 resize-none border-border bg-card/40 text-sm leading-relaxed"
            placeholder={isEnglish ? "Short description shown in article listings..." : "Descrição curta exibida na listagem de artigos..."}
            {...form.register("excerpt")}
          />
        </div>

        {/* Peripheral picker */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isEnglish ? "Related peripheral" : "Periférico relacionado"}
          </label>

          {selectedPeripheral ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
                {selectedPeripheral.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={selectedPeripheral.image_url} alt={selectedPeripheral.name} className="size-full object-cover" />
                  : <span className="text-[10px] font-bold text-muted-foreground">{selectedPeripheral.brand.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{selectedPeripheral.name}</p>
                <p className="text-xs text-muted-foreground">{selectedPeripheral.brand} · <span className="capitalize">{selectedPeripheral.category}</span></p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => { form.setValue("peripheral_id", ""); setPeripheralSearch("") }}>
                {isEnglish ? "Change" : "Trocar"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 border-border bg-card/40"
                  placeholder={isEnglish ? "Search by brand or name..." : "Buscar por marca ou nome..."}
                  value={peripheralSearch}
                  onChange={(e) => setPeripheralSearch(e.target.value)}
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card">
                {peripheralsLoading ? (
                  <p className="p-4 text-sm text-muted-foreground">{isEnglish ? "Loading peripherals..." : "Carregando periféricos..."}</p>
                ) : filteredPeripherals.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">{isEnglish ? "No peripherals found" : "Nenhum periférico encontrado"}</p>
                ) : filteredPeripherals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      form.setValue("peripheral_id", p.id, { shouldValidate: true })
                      setPeripheralSearch("")
                    }}
                    className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 text-[9px] font-bold text-muted-foreground">
                      {p.image_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                        : p.brand.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.brand} · <span className="capitalize">{p.category}</span></p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {form.formState.errors.peripheral_id && (
            <p className="text-xs text-red-400">{form.formState.errors.peripheral_id.message}</p>
          )}
        </div>

        {/* Images */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isEnglish ? "Cover images" : "Imagens de capa"}
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{isEnglish ? "Article header" : "Header do artigo"}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {BLOG_IMAGE_STANDARDS.header.width}×{BLOG_IMAGE_STANDARDS.header.height} · {BLOG_IMAGE_STANDARDS.header.aspectRatio}
                </Badge>
              </div>
              {selectedHeaderUrl ? (
                <div className="group relative overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedHeaderUrl} alt="Header" className="aspect-video w-full object-cover" />
                  <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <input accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "header")} type="file" />
                    <div className="flex flex-col items-center gap-1 text-white">
                      <Upload className="size-5" />
                      <span className="text-xs">{isEnglish ? "Change image" : "Trocar imagem"}</span>
                    </div>
                  </label>
                </div>
              ) : (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/10 transition hover:border-primary/40 hover:bg-muted/20">
                  <input accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "header")} type="file" />
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">{isEnglish ? "Click to upload" : "Clique para enviar"}</span>
                  <span className="text-[10px] text-muted-foreground/60">{isEnglish ? "Optional — adapts from card if missing" : "Opcional — adapta do card se ausente"}</span>
                </label>
              )}
            </div>

            {/* Thumbnail */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{isEnglish ? "Card thumbnail" : "Thumbnail do card"}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {BLOG_IMAGE_STANDARDS.thumbnail.width}×{BLOG_IMAGE_STANDARDS.thumbnail.height} · {BLOG_IMAGE_STANDARDS.thumbnail.aspectRatio}
                </Badge>
              </div>
              {selectedThumbnailUrl ? (
                <div className="group relative overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedThumbnailUrl} alt="Thumbnail" className="aspect-video w-full object-cover" />
                  <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <input accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "thumbnail")} type="file" />
                    <div className="flex flex-col items-center gap-1 text-white">
                      <Upload className="size-5" />
                      <span className="text-xs">{isEnglish ? "Change image" : "Trocar imagem"}</span>
                    </div>
                  </label>
                </div>
              ) : (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/10 transition hover:border-primary/40 hover:bg-muted/20">
                  <input accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "thumbnail")} type="file" />
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">{isEnglish ? "Click to upload" : "Clique para enviar"}</span>
                  <span className="text-[10px] text-muted-foreground/60">{isEnglish ? "Recommended — shown in article listing" : "Recomendado — exibido na listagem"}</span>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Video URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Youtube className="size-3.5" />
            {isEnglish ? "Video link (YouTube / Vimeo)" : "Link do vídeo (YouTube / Vimeo)"}
          </label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="border-border bg-card/40 pl-9"
              placeholder="https://youtube.com/watch?v=..."
              {...form.register("video_url")}
            />
          </div>
          {form.formState.errors.video_url && (
            <p className="text-xs text-red-400">{form.formState.errors.video_url.message}</p>
          )}
        </div>

        {/* Content */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="size-3.5" />
              {isEnglish ? "Article content" : "Conteúdo do artigo"}
            </label>
            <span className="text-[10px] text-muted-foreground">
              {watchedContent?.length ?? 0} {isEnglish ? "chars" : "caracteres"}
            </span>
          </div>
          <Textarea
            className="min-h-80 resize-y border-border bg-card/40 font-mono text-sm leading-7"
            placeholder={isEnglish ? "Write the full review or article here..." : "Escreva o review ou artigo completo aqui..."}
            {...form.register("content")}
          />
          {form.formState.errors.content && (
            <p className="text-xs text-red-400">{form.formState.errors.content.message}</p>
          )}
        </div>

        {/* Status card at bottom */}
        <Card className="border-border bg-card/50">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isEnglish ? "Publication status" : "Status de publicação"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["draft", "published"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => form.setValue("status", s)}
                  className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-left transition-all ${
                    watchedStatus === s
                      ? s === "published"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-border bg-muted/40 text-foreground"
                      : "border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  {watchedStatus === s
                    ? <CheckCircle2 className="size-4 shrink-0" />
                    : <Circle className="size-4 shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold">
                      {s === "published" ? (isEnglish ? "Published" : "Publicado") : (isEnglish ? "Draft" : "Rascunho")}
                    </p>
                    <p className="text-[10px] opacity-70">
                      {s === "published"
                        ? (isEnglish ? "Visible to everyone" : "Visível para todos")
                        : (isEnglish ? "Only visible to admins" : "Visível apenas para admins")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      </form>
    </div>
  )
}
