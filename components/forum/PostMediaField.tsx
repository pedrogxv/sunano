"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ImagePlus, Video, X } from "lucide-react"

import { GifPicker } from "@/components/comments/GifPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type MediaTab = "image" | "video"

const MAX_IMAGES = 5
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

/** Abas Imagem/Vídeo mutuamente exclusivas do formulário de post — até 5 imagens sobem de verdade, vídeo é só um link do YouTube. */
export function PostMediaField({
  imageUrls,
  videoUrl,
  onImagesChange,
  onVideoChange,
  disabled,
}: {
  imageUrls: string[]
  videoUrl: string | null
  onImagesChange: (urls: string[]) => void
  onVideoChange: (url: string | null) => void
  disabled?: boolean
}) {
  const [tab, setTab] = useState<MediaTab>(videoUrl ? "video" : "image")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadOne(file: File): Promise<string> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch("/api/forum/posts/upload-media", { method: "POST", body: formData })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "Erro ao enviar imagem")
    return data.publicUrl as string
  }

  async function handleFilesSelected(files: File[]) {
    const room = MAX_IMAGES - imageUrls.length
    if (room <= 0) return
    const toUpload = files.slice(0, room)

    const oversized = toUpload.find((file) => file.size > MAX_FILE_SIZE_BYTES)
    if (oversized) {
      setError(`Arquivo deve ter no máximo ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`)
      return
    }

    try {
      setUploading(true)
      setError(null)
      const uploaded: string[] = []
      // Sequencial (não Promise.all): evita disparar N uploads simultâneos
      // no rate limit de `forum_media_upload` e mantém a ordem das fotos.
      for (const file of toUpload) {
        uploaded.push(await uploadOne(file))
      }
      onImagesChange([...imageUrls, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar imagem")
    } finally {
      setUploading(false)
    }
  }

  function removeImage(index: number) {
    onImagesChange(imageUrls.filter((_, i) => i !== index))
  }

  /** GIF do seletor (KLIPY): entra no mesmo array e conta pro mesmo limite de 5 imagens. */
  function addGif(url: string) {
    if (imageUrls.length >= MAX_IMAGES) return
    setError(null)
    onImagesChange([...imageUrls, url])
  }

  function switchTab(next: MediaTab) {
    setTab(next)
    setError(null)
    if (next === "image") onVideoChange(null)
    else onImagesChange([])
  }

  const canAddMore = imageUrls.length < MAX_IMAGES

  return (
    <div className="space-y-2">
      <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => switchTab("image")}
          disabled={disabled}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "image" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImagePlus className="size-3.5" />
          Imagem
        </button>
        <button
          type="button"
          onClick={() => switchTab("video")}
          disabled={disabled}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "video" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Video className="size-3.5" />
          Vídeo
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {tab === "image" ? (
        <div className="space-y-2">
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, index) => (
                <div key={url} className="relative size-24 overflow-hidden rounded-lg border border-border">
                  <Image src={url} alt="" fill sizes="96px" unoptimized className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    disabled={disabled}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground transition-colors hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {canAddMore && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) handleFilesSelected(files)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 border-border text-xs"
              >
                <ImagePlus className="size-3.5" />
                {uploading
                  ? "Enviando…"
                  : imageUrls.length > 0
                    ? `Adicionar imagem (${imageUrls.length}/${MAX_IMAGES})`
                    : "Adicionar imagem"}
              </Button>
              <GifPicker
                onSelect={addGif}
                disabled={disabled || uploading}
                triggerClassName="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              />
            </div>
          )}
        </div>
      ) : (
        <Input
          value={videoUrl ?? ""}
          onChange={(e) => onVideoChange(e.target.value || null)}
          disabled={disabled}
          placeholder="https://youtube.com/watch?v=..."
          className="border-border bg-muted/20 text-sm"
        />
      )}
    </div>
  )
}
