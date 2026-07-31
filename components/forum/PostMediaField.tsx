"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ImagePlus, Video, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type MediaTab = "image" | "video"

/** Abas Imagem/Vídeo mutuamente exclusivas do formulário de post — imagem sobe de verdade, vídeo é só um link do YouTube. */
export function PostMediaField({
  imageUrl,
  videoUrl,
  onImageChange,
  onVideoChange,
  disabled,
}: {
  imageUrl: string | null
  videoUrl: string | null
  onImageChange: (url: string | null) => void
  onVideoChange: (url: string | null) => void
  disabled?: boolean
}) {
  const [tab, setTab] = useState<MediaTab>(videoUrl ? "video" : "image")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelected(file: File) {
    try {
      setUploading(true)
      setError(null)
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/forum/posts/upload-media", { method: "POST", body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "Erro ao enviar imagem")
      onImageChange(data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar imagem")
    } finally {
      setUploading(false)
    }
  }

  function switchTab(next: MediaTab) {
    setTab(next)
    setError(null)
    if (next === "image") onVideoChange(null)
    else onImageChange(null)
  }

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
        imageUrl ? (
          <div className="relative w-full max-w-xs overflow-hidden rounded-lg border border-border">
            <Image src={imageUrl} alt="" width={320} height={200} unoptimized className="w-full object-cover" />
            <button
              type="button"
              onClick={() => onImageChange(null)}
              disabled={disabled}
              className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 text-foreground transition-colors hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelected(file)
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
              {uploading ? "Enviando…" : "Adicionar imagem"}
            </Button>
          </>
        )
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
