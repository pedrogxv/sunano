"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, ImageIcon, FileText, Link2, Eye, EyeOff, Search, CheckCircle2, Circle, Youtube, Newspaper, Mouse } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import * as z from "zod"

import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { BLOG_IMAGE_STANDARDS } from "@/lib/blog-images"
import { useT } from "@/lib/use-t"
import { usePageHeader } from "@/components/providers/page-header-context"

type PeripheralOption = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string | null
}

const postSchema = z
  .object({
    post_type: z.enum(["news", "review"]),
    peripheral_id: z.string().optional().or(z.literal("")),
    title: z.string().min(5, "Título deve ter no mínimo 5 caracteres").max(200, "Título muito longo (máx. 200)"),
    excerpt: z.string().max(500, "Resumo muito longo (máx. 500)").optional(),
    cover_image_url: z.string().url("URL da imagem inválida (use http:// ou https://)").optional().or(z.literal("")),
    cover_thumbnail_url: z.string().url("URL da miniatura inválida (use http:// ou https://)").optional().or(z.literal("")),
    video_url: z.string().url("URL do vídeo inválida (use http:// ou https://)").optional().or(z.literal("")),
    content: z.string().min(20, "Conteúdo deve ter no mínimo 20 caracteres"),
    status: z.enum(["published", "draft"]),
  })
  .superRefine((data, ctx) => {
    // Só reviews precisam de periférico vinculado.
    if (data.post_type === "review" && !data.peripheral_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["peripheral_id"],
        message: "Selecione o periférico relacionado",
      })
    }
  })

type PostFormData = z.infer<typeof postSchema>

interface BlogPostFormProps {
  postId?: string
}

export function BlogPostForm({ postId }: BlogPostFormProps) {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialType: "news" | "review" = searchParams.get("type") === "news" ? "news" : "review"
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
      post_type: initialType,
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
  const watchedPostType = form.watch("post_type")
  const watchedPeripheralId = form.watch("peripheral_id")
  const isReview = watchedPostType === "review"
  const watchedContent = form.watch("content")
  const watchedTitle = form.watch("title")

  const headerTitle = postId
    ? isReview
      ? t.admin.blog.form.editReview
      : t.admin.blog.form.editNews
    : isReview
      ? t.admin.blog.form.newReview
      : t.admin.blog.form.newNews

  usePageHeader(
    headerTitle,
    isReview ? t.admin.blog.form.reviewDesc : t.admin.blog.form.newsDesc
  )

  useEffect(() => { loadPeripherals() }, [])
  useEffect(() => { if (postId) loadPost(postId) }, [postId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPeripherals() {
    setPeripheralsLoading(true)
    try {
      const res = await fetch("/api/peripherals?limit=1000", { cache: "no-store" })
      const json = (await res.json().catch(() => null)) as { peripherals?: PeripheralOption[]; error?: string } | null
      if (!res.ok || !json?.peripherals) {
        throw new Error(json?.error ?? t.admin.blog.form.failedToLoadPeripherals)
      }
      setPeripherals(json.peripherals)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.blog.form.failedToLoadPeripherals
      setError(message)
      toast.error(t.admin.blog.form.failedToLoadPeripherals, { description: message })
    } finally {
      setPeripheralsLoading(false)
    }
  }

  async function loadPost(id: string) {
    const res = await fetch(`/api/admin/blog/posts/${id}`, { cache: "no-store" })
    const json = (await res.json().catch(() => null)) as { post?: any; error?: string } | null
    if (!res.ok || !json?.post) {
      const message = json?.error ?? t.admin.blog.form.failedToLoadArticle
      setError(message)
      toast.error(t.admin.blog.form.failedToLoadArticle, { description: message })
      return
    }
    const data = json.post
    form.reset({
      post_type: data.post_type === "news" ? "news" : "review",
      peripheral_id: data.peripheral_id ?? "",
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
        if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? t.admin.blog.form.failedToUploadCover)
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
        if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? t.admin.blog.form.failedToUploadThumbnail)
        coverThumbnailUrl = data.publicUrl
      }

      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: postId,
          post_type: values.post_type,
          peripheral_id: values.post_type === "review" ? values.peripheral_id : null,
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
      if (!res.ok) throw new Error(data?.error ?? t.admin.blog.form.failedToSave)

      toast.success(
        postId ? t.admin.blog.form.articleUpdated : t.admin.blog.form.articleCreated,
        { description: values.title }
      )

      router.push("/admin/blog")
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.blog.form.failedToSave
      setError(message)
      toast.error(t.admin.blog.form.failedToSave, { description: message })
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
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between gap-4 px-6 py-3">
        <BackBreadcrumb
          href="/admin/blog"
          parentLabel={t.admin.blog.form.articles}
          currentLabel={
            postId
              ? (watchedTitle?.trim() || t.admin.blog.form.edit)
              : t.admin.blog.form.new
          }
        />
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
              ? <><Eye className="size-3.5" />{t.admin.blog.form.publishedLabel}</>
              : <><EyeOff className="size-3.5" />{t.admin.blog.form.draftLabel}</>}
          </button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isBusy} size="sm" className="min-w-28">
            {isBusy
              ? (uploadingCover === "header"
                ? t.admin.blog.form.uploadingHeader
                : uploadingCover === "thumbnail"
                  ? t.admin.blog.form.uploadingThumbnail
                  : t.admin.blog.form.saving)
              : postId
                ? t.admin.blog.form.saveChanges
                : t.admin.blog.form.publish}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        {/* Content type */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.admin.blog.form.contentType}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "news", icon: Newspaper, label: t.admin.blog.form.newsType, desc: t.admin.blog.form.newsTypeDesc },
              { value: "review", icon: Mouse, label: "Review", desc: t.admin.blog.form.reviewTypeDesc },
            ] as const).map((opt) => {
              const Icon = opt.icon
              const active = watchedPostType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => form.setValue("post_type", opt.value, { shouldValidate: true })}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    active
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <Icon className={`size-5 shrink-0 ${active ? "text-primary" : ""}`} />
                  <div>
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[10px] opacity-70">{opt.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Title — proeminente */}
        <div className="space-y-1.5">
          <Input
            className="border-0 border-b border-border rounded-none bg-transparent px-0 text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-primary"
            placeholder={t.admin.blog.form.titlePlaceholder}
            {...form.register("title")}
          />
          {form.formState.errors.title && (
            <p className="text-xs text-red-400">{form.formState.errors.title.message}</p>
          )}
          {watchedTitle && (
            <p className="text-[10px] text-muted-foreground">{watchedTitle.length} {t.admin.blog.form.chars}</p>
          )}
        </div>

        {/* Excerpt */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.admin.blog.form.summaryLabel}
          </label>
          <Textarea
            className="min-h-16 resize-none border-border bg-card/40 text-sm leading-relaxed"
            placeholder={t.admin.blog.form.summaryPlaceholder}
            {...form.register("excerpt")}
          />
        </div>

        {/* Peripheral picker — só para reviews */}
        {isReview && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.admin.blog.form.relatedPeripheral}
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
                {t.admin.blog.form.change}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 border-border bg-card/40"
                  placeholder={t.admin.blog.form.searchBrandOrName}
                  value={peripheralSearch}
                  onChange={(e) => setPeripheralSearch(e.target.value)}
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card">
                {peripheralsLoading ? (
                  <p className="p-4 text-sm text-muted-foreground">{t.admin.blog.form.loadingPeripherals}</p>
                ) : filteredPeripherals.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">{t.admin.blog.form.noPeripheralsFound}</p>
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
        )}

        {/* Images */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.admin.blog.form.coverImages}
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{t.admin.blog.form.articleHeader}</span>
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
                      <span className="text-xs">{t.admin.blog.form.changeImage}</span>
                    </div>
                  </label>
                </div>
              ) : (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/10 transition hover:border-primary/40 hover:bg-muted/20">
                  <input accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "header")} type="file" />
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">{t.admin.blog.form.clickToUpload}</span>
                  <span className="text-[10px] text-muted-foreground/60">{t.admin.blog.form.optionalAdapts}</span>
                </label>
              )}
            </div>

            {/* Thumbnail */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{t.admin.blog.form.cardThumbnail}</span>
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
                      <span className="text-xs">{t.admin.blog.form.changeImage}</span>
                    </div>
                  </label>
                </div>
              ) : (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/10 transition hover:border-primary/40 hover:bg-muted/20">
                  <input accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, "thumbnail")} type="file" />
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">{t.admin.blog.form.clickToUpload}</span>
                  <span className="text-[10px] text-muted-foreground/60">{t.admin.blog.form.recommendedShown}</span>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Video URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Youtube className="size-3.5" />
            {t.admin.blog.form.videoLink}
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
              {t.admin.blog.form.articleContent}
            </label>
            <span className="text-[10px] text-muted-foreground">
              {watchedContent?.length ?? 0} {t.admin.blog.form.chars}
            </span>
          </div>
          <Textarea
            className="min-h-80 resize-y border-border bg-card/40 font-mono text-sm leading-7"
            placeholder={t.admin.blog.form.contentPlaceholder}
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
              {t.admin.blog.form.publicationStatus}
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
                      {s === "published" ? t.admin.blog.form.publishedLabel : t.admin.blog.form.draftLabel}
                    </p>
                    <p className="text-[10px] opacity-70">
                      {s === "published" ? t.admin.blog.form.visibleToAll : t.admin.blog.form.visibleToAdmins}
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
