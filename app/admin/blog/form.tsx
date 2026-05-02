"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, Upload } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BLOG_IMAGE_STANDARDS } from "@/lib/blog-images"
import { useLocale } from "@/lib/locale-context"
import { supabase } from "@/lib/supabase"

type PeripheralOption = {
  id: string
  name: string
  brand: string
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

  useEffect(() => {
    loadPeripherals()
  }, [])

  useEffect(() => {
    if (!postId) return
    loadPost(postId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  async function loadPeripherals() {
    const { data, error: err } = await supabase
      .from("peripherals")
      .select("id, name, brand")
      .order("name", { ascending: true })

    if (err) {
      setError(err.message)
      return
    }

    setPeripherals(data ?? [])
  }

  async function loadPost(id: string) {
    const { data, error: err } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", id)
      .single()

    if (err) {
      setError(err.message)
      return
    }

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

  const handleCoverImageSelect = (event: React.ChangeEvent<HTMLInputElement>, variant: "header" | "thumbnail") => {
    const file = event.target.files?.[0]
    if (!file) return

    if (variant === "header") {
      setHeaderImageFile(file)
    } else {
      setThumbnailImageFile(file)
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      if (variant === "header") {
        setHeaderPreview(reader.result as string)
      } else {
        setThumbnailPreview(reader.result as string)
      }
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
        const uploadBody = new FormData()
        uploadBody.append("file", headerImageFile)
        uploadBody.append("title", values.title)
        uploadBody.append("variant", "header")

        const uploadResponse = await fetch("/api/admin/blog/upload-cover", {
          method: "POST",
          body: uploadBody,
        })

        const uploadData = (await uploadResponse.json().catch(() => null)) as
          | { error?: string; publicUrl?: string }
          | null

        if (!uploadResponse.ok || !uploadData?.publicUrl) {
          throw new Error(uploadData?.error ?? (isEnglish ? "Failed to upload cover image" : "Erro ao enviar imagem de capa"))
        }

        coverImageUrl = uploadData.publicUrl
      }

      if (thumbnailImageFile) {
        setUploadingCover("thumbnail")
        const uploadBody = new FormData()
        uploadBody.append("file", thumbnailImageFile)
        uploadBody.append("title", values.title)
        uploadBody.append("variant", "thumbnail")

        const uploadResponse = await fetch("/api/admin/blog/upload-cover", {
          method: "POST",
          body: uploadBody,
        })

        const uploadData = (await uploadResponse.json().catch(() => null)) as
          | { error?: string; publicUrl?: string }
          | null

        if (!uploadResponse.ok || !uploadData?.publicUrl) {
          throw new Error(uploadData?.error ?? (isEnglish ? "Failed to upload thumbnail" : "Erro ao enviar miniatura"))
        }

        coverThumbnailUrl = uploadData.publicUrl
      }

      const response = await fetch("/api/admin/blog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      const responseData = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null

      if (!response.ok) {
        throw new Error(responseData?.error ?? (isEnglish ? "Failed to save article" : "Erro ao salvar artigo"))
      }

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

  const peripheralOptions = useMemo(
    () => peripherals.map((item) => ({ value: item.id, label: `${item.brand} - ${item.name}` })),
    [peripherals]
  )

  return (
    <div className="space-y-6">
      <Link href="/admin/blog">
        <Button className="gap-2" variant="ghost">
          <ChevronLeft className="size-4" />
          {isEnglish ? "Back to articles" : "Voltar para artigos"}
        </Button>
      </Link>

      <Card className="border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle>{postId ? (isEnglish ? "Edit article" : "Editar artigo") : (isEnglish ? "New article" : "Novo artigo")}</CardTitle>
          <CardDescription>
            {isEnglish ? "Main image standard: blog card. Header cover is optional and can be adapted automatically." : "Padrão principal de capa: card do blog. A capa de header é opcional e pode ser adaptada automaticamente."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {error ? (
            <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
          ) : null}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold text-primary">{isEnglish ? "Blog image standards" : "Padrões de imagem do blog"}</p>
              <p>
                {isEnglish
                  ? `Card cover (main standard): ratio ${BLOG_IMAGE_STANDARDS.thumbnail.aspectRatio}, recommended resolution ${BLOG_IMAGE_STANDARDS.thumbnail.width}x${BLOG_IMAGE_STANDARDS.thumbnail.height}. This image is used in the reviews listing and should remain readable at reduced size.`
                  : `Capa de card (padrão principal): proporção ${BLOG_IMAGE_STANDARDS.thumbnail.aspectRatio}, resolução recomendada ${BLOG_IMAGE_STANDARDS.thumbnail.width}x${BLOG_IMAGE_STANDARDS.thumbnail.height}. Essa imagem é usada na listagem de reviews e deve manter leitura boa em tamanho reduzido.`}
              </p>
              <p>
                {isEnglish
                  ? `Header cover (optional): ratio ${BLOG_IMAGE_STANDARDS.header.aspectRatio}, recommended resolution ${BLOG_IMAGE_STANDARDS.header.width}x${BLOG_IMAGE_STANDARDS.header.height}. Use a horizontal image with centered subject to avoid crops at the top of the article.`
                  : `Capa de header (opcional): proporção ${BLOG_IMAGE_STANDARDS.header.aspectRatio}, resolução recomendada ${BLOG_IMAGE_STANDARDS.header.width}x${BLOG_IMAGE_STANDARDS.header.height}. Use imagem horizontal com assunto centralizado para evitar cortes no topo do artigo.`}
              </p>
              <p>
                {isEnglish
                  ? "Automatic fallback: if you upload only the card cover, the header is adapted. If you upload only the header cover, the card is also adapted."
                  : "Fallback automático: se você enviar só a capa de card, o header é adaptado. Se enviar só a capa de header, o card também é adaptado."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Related peripheral" : "Periférico relacionado"}</label>
              <Select
                value={form.watch("peripheral_id")}
                onValueChange={(value) => form.setValue("peripheral_id", value, { shouldValidate: true })}
              >
                <SelectTrigger className="border-border bg-card/50">
                  <SelectValue placeholder={isEnglish ? "Select a peripheral" : "Selecione um periférico"} />
                </SelectTrigger>
                <SelectContent>
                  {peripheralOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.peripheral_id ? (
                <p className="text-xs text-red-400">{form.formState.errors.peripheral_id.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Title" : "Título"}</label>
              <Input
                className="border-border bg-card/50"
                placeholder="Review: Logitech G Pro X Superlight 2"
                {...form.register("title")}
              />
              <p className="text-xs text-muted-foreground">
                {isEnglish ? "The slug is generated automatically in the backend and cannot be edited." : "O slug é gerado automaticamente no backend e não pode ser editado."}
              </p>
              {form.formState.errors.title ? (
                <p className="text-xs text-red-400">{form.formState.errors.title.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Summary" : "Resumo"}</label>
              <Textarea
                className="min-h-20 border-border bg-card/50"
                placeholder={isEnglish ? "Short summary for blog listing" : "Resumo curto para a listagem do blog"}
                {...form.register("excerpt")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{isEnglish ? "Header cover (upload)" : "Capa do header (Upload)"}</label>
                <label className="block rounded-lg border-2 border-dashed border-border p-5 cursor-pointer hover:border-primary/40 transition">
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleCoverImageSelect(event, "header")}
                    type="file"
                  />
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Upload className="size-4 text-muted-foreground" />
                    {isEnglish ? "Click to upload the main image" : "Clique para enviar a imagem principal"}
                  </div>
                </label>
                <p className="text-xs text-muted-foreground">
                  {isEnglish
                    ? `Optional cover for article top. Header standard: ${BLOG_IMAGE_STANDARDS.header.width}x${BLOG_IMAGE_STANDARDS.header.height} (${BLOG_IMAGE_STANDARDS.header.aspectRatio}), with horizontal framing and center focus.`
                    : `Capa opcional para topo do artigo. Padrão do header: ${BLOG_IMAGE_STANDARDS.header.width}x${BLOG_IMAGE_STANDARDS.header.height} (${BLOG_IMAGE_STANDARDS.header.aspectRatio}), com enquadramento horizontal e foco no centro.`}
                </p>
                {form.formState.errors.cover_image_url ? (
                  <p className="text-xs text-red-400">{form.formState.errors.cover_image_url.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{isEnglish ? "Card cover (upload)" : "Capa do card (Upload)"}</label>
                <label className="block rounded-lg border-2 border-dashed border-border p-5 cursor-pointer hover:border-primary/40 transition">
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleCoverImageSelect(event, "thumbnail")}
                    type="file"
                  />
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Upload className="size-4 text-muted-foreground" />
                    {isEnglish ? "Click to upload the thumbnail" : "Clique para enviar a miniatura"}
                  </div>
                </label>
                <p className="text-xs text-muted-foreground">
                  {isEnglish
                    ? `Card cover standard: ${BLOG_IMAGE_STANDARDS.thumbnail.width}x${BLOG_IMAGE_STANDARDS.thumbnail.height} (${BLOG_IMAGE_STANDARDS.thumbnail.aspectRatio}). If not uploaded, the thumbnail will be adapted from the header cover.`
                    : `Padrão da capa de card: ${BLOG_IMAGE_STANDARDS.thumbnail.width}x${BLOG_IMAGE_STANDARDS.thumbnail.height} (${BLOG_IMAGE_STANDARDS.thumbnail.aspectRatio}). Se não enviar, a miniatura será adaptada a partir da capa de header.`}
                </p>
                {form.formState.errors.cover_thumbnail_url ? (
                  <p className="text-xs text-red-400">{form.formState.errors.cover_thumbnail_url.message}</p>
                ) : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground">{isEnglish ? "Video (external link)" : "Vídeo (link externo)"}</label>
                <Input
                  className="border-border bg-card/50"
                  placeholder="https://youtube.com/watch?v=..."
                  {...form.register("video_url")}
                />
                <p className="text-xs text-muted-foreground">{isEnglish ? "Video only via URL (YouTube/Vimeo), no upload." : "Vídeo sempre via URL (YouTube/Vimeo), sem upload."}</p>
                {form.formState.errors.video_url ? (
                  <p className="text-xs text-red-400">{form.formState.errors.video_url.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {selectedHeaderUrl ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Preview header</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedHeaderUrl}
                    alt="Capa do header"
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                  />
                </div>
              ) : null}

              {selectedThumbnailUrl ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Preview card</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedThumbnailUrl}
                    alt="Capa do card"
                    className="aspect-[2/1] w-full rounded-lg border border-border object-cover"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Article content" : "Conteúdo do artigo"}</label>
              <Textarea
                className="min-h-64 border-border bg-card/50 leading-6"
                placeholder={isEnglish ? "Write the full review/article..." : "Escreva o review/artigo completo..."}
                {...form.register("content")}
              />
              {form.formState.errors.content ? (
                <p className="text-xs text-red-400">{form.formState.errors.content.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Status" : "Status"}</label>
              <Select
                value={form.watch("status")}
                onValueChange={(value) => form.setValue("status", value as "published" | "draft")}
              >
                <SelectTrigger className="border-border bg-card/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">{isEnglish ? "Published" : "Publicado"}</SelectItem>
                  <SelectItem value="draft">{isEnglish ? "Draft" : "Rascunho"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving || Boolean(uploadingCover)}>
                {saving || uploadingCover ? (isEnglish ? "Saving..." : "Salvando...") : postId ? (isEnglish ? "Save changes" : "Salvar alterações") : (isEnglish ? "Create article" : "Criar artigo")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
