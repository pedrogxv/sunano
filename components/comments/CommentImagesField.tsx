"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ImagePlus, X } from "lucide-react"

import { compressImageFile } from "@/lib/client/compress-image"

const MAX_IMAGES = 2

// Alvo bem mais agressivo que o de capa/banner (que mira 5MB): comentário é
// alto volume, então cada byte poupado aqui multiplica pelo número de
// comentários — o bucket dedicado `comments` já trava 1MB por arquivo no
// Supabase, e mirar bem abaixo disso reduz o storage/egress consumido.
const COMPRESS_OPTIONS = {
  maxDimension: 1280,
  targetBytes: 480 * 1024,
  skipBelowBytes: 200 * 1024,
}

/**
 * Anexo de até 2 imagens em um comentário — reaproveitável em qualquer
 * formulário de comentário/resposta do site. Comprime no navegador antes de
 * enviar (mesma técnica de `ProfileSection`) e sobe para
 * `/api/comments/upload-image`, que já valida tamanho/tipo real e devolve a
 * URL pública do bucket `comments`.
 */
export function CommentImagesField({
  imageUrls,
  onImagesChange,
  disabled,
}: {
  imageUrls: string[]
  onImagesChange: (urls: string[]) => void
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadOne(file: File): Promise<string> {
    const compressed = await compressImageFile(file, COMPRESS_OPTIONS)
    const formData = new FormData()
    formData.append("file", compressed)
    const res = await fetch("/api/comments/upload-image", { method: "POST", body: formData })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "Erro ao enviar imagem")
    return data.publicUrl as string
  }

  async function handleFilesSelected(files: File[]) {
    const room = MAX_IMAGES - imageUrls.length
    if (room <= 0) return
    const toUpload = files.slice(0, room)

    try {
      setUploading(true)
      setError(null)
      const uploaded: string[] = []
      // Sequencial: mantém a ordem e evita rajada no rate limit de
      // `comment_media_upload` quando o usuário seleciona as 2 de uma vez.
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

  const canAddMore = imageUrls.length < MAX_IMAGES

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url, index) => (
            <div key={url} className="relative size-16 overflow-hidden rounded-lg border border-border">
              <Image src={url} alt="" fill unoptimized className="object-cover" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                disabled={disabled}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <>
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
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
          >
            <ImagePlus className="size-3.5" />
            {uploading
              ? "Enviando…"
              : imageUrls.length > 0
                ? `Adicionar imagem (${imageUrls.length}/${MAX_IMAGES})`
                : "Adicionar imagem"}
          </button>
        </>
      )}
    </div>
  )
}
