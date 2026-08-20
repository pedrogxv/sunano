"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { ImagePlus, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Espelha MAX_SUPPORT_IMAGES_PER_MESSAGE de lib/server/support-media.ts — não pode importar `server-only` num client component. */
const MAX_SUPPORT_IMAGES_PER_MESSAGE = 3

/**
 * Anexa imagens à resposta do admin sem sair do modelo de Server Action da
 * página: sobe o arquivo via fetch, e guarda a URL pública em inputs hidden
 * dentro do MESMO <form> — a Server Action recebe tudo junto no FormData,
 * como se o upload tivesse acontecido no servidor.
 */
export function SupportReplyImageUpload() {
  const [urls, setUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (urls.length >= MAX_SUPPORT_IMAGES_PER_MESSAGE) {
      toast.error(`Máximo de ${MAX_SUPPORT_IMAGES_PER_MESSAGE} imagens por mensagem.`)
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/support/upload-image", { method: "POST", body: formData })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.publicUrl) {
        toast.error(data?.error ?? "Erro ao enviar imagem.")
        return
      }
      setUrls((prev) => [...prev, data.publicUrl])
    } catch {
      toast.error("Erro ao enviar imagem.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {urls.map((url) => (
        <div key={url} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Anexo" className="size-14 rounded-lg border border-border object-cover" />
          <input type="hidden" name="imageUrls" value={url} />
          <button
            type="button"
            onClick={() => setUrls((prev) => prev.filter((u) => u !== url))}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground"
            aria-label="Remover anexo"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}

      {urls.length < MAX_SUPPORT_IMAGES_PER_MESSAGE && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-border text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            Anexar imagem
          </Button>
        </>
      )}
    </div>
  )
}
